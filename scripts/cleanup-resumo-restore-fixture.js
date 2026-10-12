/*
 * Remove somente uma fixture de restauração da Fase 3C.
 * Uso: node scripts/cleanup-resumo-restore-fixture.js <projectId>
 * Requer DARCY_TOKEN_A exportado no ambiente atual.
 */

const apiBaseUrl = process.env.DARCY_API_BASE_URL || 'http://localhost:3001'
const tokenA = process.env.DARCY_TOKEN_A
const fixturePrefix = 'FIXTURE_3C_RESTAURACAO_'
const projectId = process.argv[2]

if (!tokenA) {
  console.error('BLOQUEADO: DARCY_TOKEN_A deve estar definido no ambiente.')
  process.exit(2)
}

if (!projectId) {
  console.error('USO: node scripts/cleanup-resumo-restore-fixture.js <projectId>')
  process.exit(2)
}

async function apiRequest(method, path) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${tokenA}` },
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

async function run() {
  const projectPath = `/api/projects/${encodeURIComponent(projectId)}`
  const getResponse = await apiRequest('GET', projectPath)
  const project = getResponse.data?.project

  if (
    getResponse.status !== 200 ||
    project?.type !== 'resumo-academico' ||
    typeof project?.title !== 'string' ||
    !project.title.startsWith(fixturePrefix)
  ) {
    throw new Error('O Project informado não corresponde a uma fixture de restauração da Fase 3C pertencente ao usuário atual.')
  }

  const deleteResponse = await apiRequest('DELETE', projectPath)
  if (deleteResponse.status !== 204) {
    throw new Error('Não foi possível remover a fixture de restauração.')
  }

  console.log('FIXTURE_REMOVIDA')
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Falha não identificada ao remover a fixture.'
  console.error(`LIMPEZA_NAO_EXECUTADA: ${message}`)
  process.exitCode = 1
})
