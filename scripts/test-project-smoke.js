/*
 * Smoke técnico de Projects — Fase 3A.
 * Requer DARCY_TOKEN_A e DARCY_TOKEN_B exportados no ambiente atual.
 * Tokens são usados somente em memória e nunca são exibidos.
 */

const apiBaseUrl = process.env.DARCY_API_BASE_URL || 'http://localhost:3001'
const tokenA = process.env.DARCY_TOKEN_A
const tokenB = process.env.DARCY_TOKEN_B

if (!tokenA || !tokenB) {
  console.error('BLOQUEADO: DARCY_TOKEN_A e DARCY_TOKEN_B devem estar definidos no ambiente.')
  process.exit(2)
}

const results = []
const createdProjectIds = []
let primaryProjectId = null

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

function isIsoTimestamp(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function hasOnlyPublicProjectFields(project) {
  if (!project || typeof project !== 'object') return false

  const allowedFields = new Set(['id', 'title', 'displayTitle', 'resumoMeta', 'field', 'type', 'createdAt', 'updatedAt'])
  return Object.keys(project).every((field) => allowedFields.has(field)) &&
    !('profileId' in project) &&
    !('profile' in project)
}

async function scenario(id, label, expected, operation, condition = () => true) {
  const response = await operation()
  const passed = response.status === expected && condition(response.data)
  report(`${id} — ${label}`, expected, response.status, passed)

  if (!passed) {
    throw new Error(`${id} falhou.`)
  }

  return response.data
}

async function ensureDistinctAuthenticatedUsers() {
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

async function cleanupProjects() {
  for (const projectId of createdProjectIds) {
    try {
      const response = await apiRequest('DELETE', `/api/projects/${encodeURIComponent(projectId)}`, {
        token: tokenA,
      })

      if (response.status !== 204 && response.status !== 404) {
        throw new Error('Status inesperado na limpeza.')
      }
    } catch {
      console.error('⚠ Não foi possível confirmar a limpeza de um Project temporário.')
      process.exitCode = 1
    }
  }
}

async function run() {
  await ensureDistinctAuthenticatedUsers()

  const suffix = Date.now().toString(36)
  const initialTitle = `SMOKE_DARCY_A_${suffix}`
  const secondTitle = `SMOKE_DARCY_A2_${suffix}`
  const updatedTitle = `SMOKE_DARCY_ATUALIZADO_${suffix}`

  await scenario('S1', 'Health da API', 200, () => apiRequest('GET', '/api/darcy/health'), (data) => data?.ok === true)

  await scenario('S2', 'Listagens autenticadas de A e B', 200, async () => {
    const [listA, listB] = await Promise.all([
      apiRequest('GET', '/api/projects', { token: tokenA }),
      apiRequest('GET', '/api/projects', { token: tokenB }),
    ])
    return { status: listA.status === 200 && listB.status === 200 ? 200 : Math.max(listA.status, listB.status), data: { listA, listB } }
  }, (data) => Array.isArray(data?.listA?.data?.projects) && Array.isArray(data?.listB?.data?.projects))

  await scenario('S3', 'DTOs da listagem não expõem campos internos', 200, async () => {
    const response = await apiRequest('GET', '/api/projects', { token: tokenA })
    return response
  }, (data) => Array.isArray(data?.projects) && data.projects.every(hasOnlyPublicProjectFields))

  const createdPrimary = await scenario('S4', 'Criação de Project temporário', 201, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: { title: initialTitle, field: 'Smoke técnico', type: 'artigo' },
  }), (data) => {
    const project = data?.project
    return typeof project?.id === 'string' && project.id.length > 0 &&
      project.type === 'artigo' &&
      isIsoTimestamp(project.createdAt) &&
      isIsoTimestamp(project.updatedAt) &&
      hasOnlyPublicProjectFields(project)
  })
  primaryProjectId = createdPrimary.project.id
  createdProjectIds.push(primaryProjectId)
  const originalCreatedAt = createdPrimary.project.createdAt
  const originalUpdatedAt = createdPrimary.project.updatedAt

  await scenario('S5', 'Project criado persiste em GET posterior', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenA,
  }), (data) => data?.project?.title === initialTitle && data?.project?.createdAt === originalCreatedAt)

  const updatedProject = await scenario('S6', 'Atualização persiste e updatedAt é coerente', 200, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenA,
    body: { title: updatedTitle },
  }), (data) => data?.project?.title === updatedTitle && Date.parse(data?.project?.updatedAt) >= Date.parse(originalUpdatedAt))

  await scenario('S7', 'ID e createdAt permanecem imutáveis', 200, () => apiRequest('GET', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenA,
  }), (data) => data?.project?.id === primaryProjectId && data?.project?.createdAt === originalCreatedAt && data?.project?.updatedAt === updatedProject?.project?.updatedAt)

  await scenario('S8', 'Project temporário aparece para A', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenA,
  }), (data) => hasProject(data?.projects, primaryProjectId))

  await scenario('S9', 'Project temporário não aparece para B', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenB,
  }), (data) => !hasProject(data?.projects, primaryProjectId))

  await scenario('S10', 'Acesso cruzado de B retorna 404', 404, () => apiRequest('GET', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenB,
  }))

  await scenario('S11', 'Payloads inválidos são rejeitados', 400, async () => {
    const invalidRequests = await Promise.all([
      apiRequest('POST', '/api/projects', {
        token: tokenA,
        body: { title: 'Campo extra', field: 'Smoke técnico', type: 'artigo', extra: true },
      }),
      apiRequest('POST', '/api/projects', {
        token: tokenA,
        body: { title: 'Falsificação', field: 'Smoke técnico', type: 'artigo', profileId: 'não-confiável' },
      }),
      apiRequest('POST', '/api/projects', {
        token: tokenA,
        body: { title: 'Tipo inválido', field: 'Smoke técnico', type: 'invalido' },
      }),
    ])
    const allRejected = invalidRequests.every((response) => response.status === 400)
    return { status: allRejected ? 400 : Math.max(...invalidRequests.map((response) => response.status)), data: { allRejected } }
  }, (data) => data?.allRejected === true)

  await scenario('S12', 'PATCH vazio é rejeitado', 400, () => apiRequest('PATCH', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenA,
    body: {},
  }))

  await scenario('S13', 'Exclusão de Project temporário', 204, () => apiRequest('DELETE', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenA,
  }))

  await scenario('S14', 'GET após exclusão retorna 404', 404, () => apiRequest('GET', `/api/projects/${encodeURIComponent(primaryProjectId)}`, {
    token: tokenA,
  }))

  await scenario('S15', 'Project excluído não aparece para A', 200, () => apiRequest('GET', '/api/projects', {
    token: tokenA,
  }), (data) => !hasProject(data?.projects, primaryProjectId))

  const createdSecond = await scenario('S16', 'IDs de dois Projects temporários são únicos', 201, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: { title: secondTitle, field: 'Smoke técnico', type: 'tese' },
  }), (data) => typeof data?.project?.id === 'string' && data.project.id !== primaryProjectId)
  createdProjectIds.push(createdSecond.project.id)
}

run()
  .catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha não identificada no smoke.'
    console.error(`SMOKE_INTERROMPIDO: ${message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanupProjects()
    const passed = results.filter((result) => result.passed).length
    const failed = results.filter((result) => !result.passed).length
    console.log(`Total: ${results.length}`)
    console.log(`Aprovados: ${passed}`)
    console.log(`Falhos: ${failed}`)
  })
