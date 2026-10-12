/*
 * Bateria 2D.4 — ownership e isolamento de Projects.
 *
 * Execute no mesmo terminal em que DARCY_TOKEN_A e DARCY_TOKEN_B estão
 * exportados. Os tokens são usados somente em memória e nunca são exibidos.
 */

const apiBaseUrl = process.env.DARCY_API_BASE_URL || 'http://localhost:3001'
const tokenA = process.env.DARCY_TOKEN_A
const tokenB = process.env.DARCY_TOKEN_B

if (!tokenA || !tokenB) {
  console.error('BLOQUEADO: DARCY_TOKEN_A e DARCY_TOKEN_B devem estar definidos no ambiente.')
  process.exit(2)
}

const results = []
let projectAId = null
let projectBId = null
let projectADeleted = false
let projectBDeleted = false

function report(label, expected, observed, passed) {
  results.push({ label, expected, observed, passed })
  console.log(`${passed ? '✅' : '❌'} ${label} — esperado ${expected}, observado ${observed}`)
}

async function apiRequest(method, path, { token, body } = {}) {
  const headers = {}

  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })

  const text = await response.text()
  let data = null

  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  return { status: response.status, data }
}

function hasProject(projects, projectId) {
  return Array.isArray(projects) && projects.some((project) => project?.id === projectId)
}

async function scenario(number, label, expectedStatus, operation, condition = () => true) {
  const response = await operation()
  const passed = response.status === expectedStatus && condition(response.data)
  report(`${number}. ${label}`, expectedStatus, response.status, passed)

  if (!passed) {
    throw new Error(`Cenário ${number} falhou.`)
  }

  return response.data
}

async function validateTestIdentities() {
  const [authA, authB] = await Promise.all([
    apiRequest('GET', '/api/auth/me', { token: tokenA }),
    apiRequest('GET', '/api/auth/me', { token: tokenB }),
  ])

  if (
    authA.status !== 200 ||
    authB.status !== 200 ||
    !authA.data?.user?.id ||
    !authB.data?.user?.id ||
    authA.data.user.id === authB.data.user.id
  ) {
    throw new Error('Os tokens não representam duas identidades Supabase autenticadas e distintas.')
  }
}

async function cleanupTestProjects() {
  const targets = [
    { id: projectAId, token: tokenA, wasDeleted: projectADeleted },
    { id: projectBId, token: tokenB, wasDeleted: projectBDeleted },
  ]

  for (const target of targets) {
    if (!target.id || target.wasDeleted) continue

    try {
      const response = await apiRequest('DELETE', `/api/projects/${encodeURIComponent(target.id)}`, {
        token: target.token,
      })

      if (response.status !== 204 && response.status !== 404) {
        throw new Error('Status inesperado na limpeza.')
      }
    } catch {
      console.error('⚠ Não foi possível confirmar a limpeza de um Project de teste.')
      process.exitCode = 1
    }
  }
}

async function run() {
  await validateTestIdentities()

  const suffix = Date.now().toString(36)
  const titleA = `Auditoria ownership A ${suffix}`
  const updatedTitleA = `Auditoria ownership A atualizada ${suffix}`
  const titleB = `Auditoria ownership B ${suffix}`

  await scenario(1, 'GET lista sem token', 401, () => apiRequest('GET', '/api/projects'))
  await scenario(2, 'POST sem token', 401, () => apiRequest('POST', '/api/projects', {
    body: { title: 'Sem autenticação', field: 'Auditoria', type: 'artigo' },
  }))

  const createdA = await scenario(3, 'A cria Project A', 201, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: { title: titleA, field: 'Auditoria', type: 'artigo' },
  }), (data) => typeof data?.project?.id === 'string')
  projectAId = createdA.project.id

  await scenario(4, 'A lista e encontra Project A', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenA,
  }), (data) => hasProject(data?.projects, projectAId))
  await scenario(5, 'A consulta Project A', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectAId)}`, {
    token: tokenA,
  }))

  const createdB = await scenario(6, 'B cria Project B', 201, () => apiRequest('POST', '/api/projects', {
    token: tokenB,
    body: { title: titleB, field: 'Auditoria', type: 'tese' },
  }), (data) => typeof data?.project?.id === 'string')
  projectBId = createdB.project.id

  await scenario(7, 'B lista e encontra Project B', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenB,
  }), (data) => hasProject(data?.projects, projectBId))
  await scenario(8, 'B consulta Project B', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenB,
  }))

  await scenario(9, 'A não recebe Project B na listagem', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenA,
  }), (data) => !hasProject(data?.projects, projectBId))
  await scenario(10, 'B não recebe Project A na listagem', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenB,
  }), (data) => !hasProject(data?.projects, projectAId))

  await scenario(11, 'A não consulta Project B', 404, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenA,
  }))
  await scenario(12, 'B não consulta Project A', 404, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectAId)}`, {
    token: tokenB,
  }))

  await scenario(13, 'A não atualiza Project B', 404, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenA,
    body: { title: 'Alteração cruzada não autorizada' },
  }))
  await scenario(14, 'Project B permanece inalterado', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenB,
  }), (data) => data?.project?.title === titleB)

  await scenario(15, 'A não exclui Project B', 404, () => apiRequest('DELETE', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenA,
  }))
  await scenario(16, 'Project B continua existindo', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenB,
  }))

  await scenario(17, 'A atualiza Project A', 200, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(projectAId)}`, {
    token: tokenA,
    body: { title: updatedTitleA },
  }))
  await scenario(18, 'Alteração de Project A persiste', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectAId)}`, {
    token: tokenA,
  }), (data) => data?.project?.title === updatedTitleA)

  await scenario(19, 'A exclui Project A', 204, () => apiRequest('DELETE', `/api/projects/${encodeURIComponent(projectAId)}`, {
    token: tokenA,
  }))
  projectADeleted = true
  await scenario(20, 'B continua consultando Project B', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenB,
  }))

  await scenario(21, 'A não cria Project com profileId', 400, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: { title: 'Falsificação', field: 'Auditoria', type: 'artigo', profileId: 'não-confiável' },
  }))
  await scenario(22, 'A não faz PATCH com profileId', 400, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenA,
    body: { profileId: 'não-confiável' },
  }))
  await scenario(23, 'A não faz PATCH com id no body', 400, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenA,
    body: { id: 'não-confiável' },
  }))

  await scenario(24, 'PATCH vazio é rejeitado', 400, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenB,
    body: {},
  }))
  await scenario(25, 'ProjectType inválido é rejeitado', 400, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: { title: 'Tipo inválido', field: 'Auditoria', type: 'invalido' },
  }))
  await scenario(26, 'Campo desconhecido é rejeitado', 400, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: { title: 'Campo extra', field: 'Auditoria', type: 'artigo', campoExtra: true },
  }))

  await scenario(27, 'B exclui Project B', 204, () => apiRequest('DELETE', `/api/projects/${encodeURIComponent(projectBId)}`, {
    token: tokenB,
  }))
  projectBDeleted = true

  const [finalListA, finalListB] = await Promise.all([
    apiRequest('GET', '/api/projects', { token: tokenA }),
    apiRequest('GET', '/api/projects', { token: tokenB }),
  ])
  const cleanupConfirmed = (
    finalListA.status === 200 &&
    finalListB.status === 200 &&
    !hasProject(finalListA.data?.projects, projectAId) &&
    !hasProject(finalListB.data?.projects, projectBId)
  )
  report('28. Projects de teste foram removidos', '200 e ausência dos Projects de teste', cleanupConfirmed ? 'confirmado' : 'não confirmado', cleanupConfirmed)
  if (!cleanupConfirmed) throw new Error('Cenário 28 falhou.')
}

run()
  .catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha não identificada na bateria.'
    console.error(`BATERIA_INTERROMPIDA: ${message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanupTestProjects()
    const passed = results.filter((result) => result.passed).length
    const failed = results.filter((result) => !result.passed).length
    console.log(`Total: ${results.length}`)
    console.log(`Aprovados: ${passed}`)
    console.log(`Falhos: ${failed}`)
  })
