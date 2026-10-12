/*
 * Regressão da persistência de Resumo Acadêmico — Fase 3B.
 * Requer DARCY_TOKEN_A e DARCY_TOKEN_B exportados no ambiente atual.
 * Tokens são mantidos apenas em memória e nunca são exibidos.
 */

const apiBaseUrl = process.env.DARCY_API_BASE_URL || 'http://localhost:3001'
const tokenA = process.env.DARCY_TOKEN_A
const tokenB = process.env.DARCY_TOKEN_B

if (!tokenA || !tokenB) {
  console.error('BLOQUEADO: DARCY_TOKEN_A e DARCY_TOKEN_B devem estar definidos no ambiente.')
  process.exit(2)
}

const results = []
let projectId = null
let projectDeleted = false

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

function createProgress(tema) {
  const etapa = {
    respostas_usuario: {},
    diagnostico: '',
    lacunas: [],
    texto_sugerido: '',
    status: 'pendente',
  }

  return {
    titulo_provisorio: '',
    tema,
    area_conhecimento: '',
    nivel_academico: '',
    estagio_pesquisa: 'nao_iniciado',
    contexto: etapa,
    objetivo: { ...etapa },
    metodologia: { ...etapa },
    fundamentacao_teorica: { ...etapa },
    resultados: { ...etapa, tipo: '' },
    resumo_completo: '',
    numero_palavras: 0,
    limite_palavras: 250,
    avaliacao_final: {
      coerencia: '',
      clareza: '',
      coesao: '',
      adequacao_academica: '',
      problemas_identificados: [],
      sugestoes: [],
    },
  }
}

async function scenario(id, label, expected, operation, condition = () => true) {
  const response = await operation()
  const passed = response.status === expected && condition(response.data)
  report(`${id} — ${label}`, expected, response.status, passed)

  if (!passed) throw new Error(`${id} falhou.`)

  return response.data
}

async function validateDistinctIdentities() {
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

async function cleanupProject() {
  if (!projectId || projectDeleted) return

  try {
    const response = await apiRequest('DELETE', `/api/projects/${encodeURIComponent(projectId)}`, {
      token: tokenA,
    })

    if (response.status !== 204 && response.status !== 404) {
      throw new Error('Status inesperado na limpeza.')
    }
  } catch {
    console.error('⚠ Não foi possível confirmar a limpeza do Project temporário de Resumo Acadêmico.')
    process.exitCode = 1
  }
}

async function run() {
  await validateDistinctIdentities()

  const suffix = Date.now().toString(36)
  const temaInicial = `Tema de regressão ${suffix}`
  const temaAtualizado = `Tema atualizado ${suffix}`

  const createdProject = await scenario('R1', 'A cria Project de Resumo Acadêmico', 201, () => apiRequest('POST', '/api/projects', {
    token: tokenA,
    body: {
      title: `Resumo Acadêmico ${suffix}`,
      field: 'Regressão técnica',
      type: 'resumo-academico',
    },
  }), (data) => typeof data?.project?.id === 'string' && data.project.type === 'resumo-academico')
  projectId = createdProject.project.id

  const progressPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`

  await scenario('R2', 'GET inicial retorna progresso nulo', 200, () => apiRequest('GET', progressPath, {
    token: tokenA,
  }), (data) => data?.ok === true && data.progress === null)

  const initialProgress = createProgress(temaInicial)
  await scenario('R3', 'A persiste estado válido', 200, () => apiRequest('PUT', progressPath, {
    token: tokenA,
    body: { progress: initialProgress },
  }), (data) => data?.ok === true && data?.progress?.tema === temaInicial)

  await scenario('R4', 'GET posterior retorna o estado persistido', 200, () => apiRequest('GET', progressPath, {
    token: tokenA,
  }), (data) => data?.ok === true && data?.progress?.tema === temaInicial)

  const updatedProgress = createProgress(temaAtualizado)
  updatedProgress.contexto = {
    ...updatedProgress.contexto,
    respostas_usuario: { problema_central: 'Problema de regressão' },
    status: 'em_revisao',
  }
  await scenario('R5', 'Novo PUT atualiza o progresso existente', 200, () => apiRequest('PUT', progressPath, {
    token: tokenA,
    body: { progress: updatedProgress },
  }), (data) => data?.ok === true &&
    data?.progress?.tema === temaAtualizado &&
    data?.progress?.contexto?.status === 'em_revisao' &&
    data?.progress?.contexto?.respostas_usuario?.problema_central === 'Problema de regressão')

  await scenario('R6', 'B não lê progresso de Project de A', 404, () => apiRequest('GET', progressPath, {
    token: tokenB,
  }))

  await scenario('R7', 'B não altera progresso de Project de A', 404, () => apiRequest('PUT', progressPath, {
    token: tokenB,
    body: { progress: createProgress('Tentativa cruzada') },
  }))

  await scenario('R8', 'Payload inválido é rejeitado', 400, () => apiRequest('PUT', progressPath, {
    token: tokenA,
    body: { progress: { tema: 'Estado incompleto' } },
  }))

  const unauthenticatedResponses = await Promise.all([
    apiRequest('GET', progressPath),
    apiRequest('PUT', progressPath, { body: { progress: createProgress('Sem token') } }),
  ])
  const unauthenticatedPassed = unauthenticatedResponses.every((response) => response.status === 401)
  report('R9 — GET e PUT sem token são rejeitados', '401/401', unauthenticatedResponses.map((response) => response.status).join('/'), unauthenticatedPassed)
  if (!unauthenticatedPassed) throw new Error('R9 falhou.')

  const deleteResponse = await apiRequest('DELETE', `/api/projects/${encodeURIComponent(projectId)}`, {
    token: tokenA,
  })
  projectDeleted = true
  const progressAfterDelete = await apiRequest('GET', progressPath, {
    token: tokenA,
  })
  const cascadePassed = deleteResponse.status === 204 && progressAfterDelete.status === 404
  report(
    'R10 — Exclusão do Project remove o acesso ao progresso em cascade',
    '204 e 404',
    `${deleteResponse.status} e ${progressAfterDelete.status}`,
    cascadePassed,
  )
  if (!cascadePassed) throw new Error('R10 falhou.')
}

run()
  .catch((error) => {
    const message = error instanceof Error ? error.message : 'Falha não identificada na regressão de Resumo Acadêmico.'
    console.error(`REGRESSAO_INTERROMPIDA: ${message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await cleanupProject()
    const passed = results.filter((result) => result.passed).length
    const failed = results.filter((result) => !result.passed).length
    console.log(`Total: ${results.length}`)
    console.log(`Aprovados: ${passed}`)
    console.log(`Falhos: ${failed}`)
  })
