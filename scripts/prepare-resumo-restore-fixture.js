/*
 * Prepara uma fixture persistente para validação manual da Fase 3C.
 * Requer DARCY_TOKEN_A exportado no ambiente atual.
 * O token é usado somente em memória e nunca é exibido.
 */

const apiBaseUrl = process.env.DARCY_API_BASE_URL || 'http://localhost:3001'
const tokenA = process.env.DARCY_TOKEN_A
const fixturePrefix = 'FIXTURE_3C_RESTAURACAO_'

if (!tokenA) {
  console.error('BLOQUEADO: DARCY_TOKEN_A deve estar definido no ambiente.')
  process.exit(2)
}

async function apiRequest(method, path, body) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tokenA}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
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

function createFixtureProgress() {
  const etapaPendente = {
    respostas_usuario: {},
    diagnostico: '',
    lacunas: [],
    texto_sugerido: '',
    status: 'pendente',
  }

  return {
    titulo_provisorio: 'Resumo restaurado — Fixture Fase 3C',
    tema: 'Fixture 3C: restauração remota de progresso em Resumo Acadêmico',
    area_conhecimento: 'Ciência da Computação',
    nivel_academico: 'Mestrado',
    estagio_pesquisa: 'resultados_parciais',
    contexto: {
      respostas_usuario: {
        problema_central: 'Ausência de persistência confiável do progresso em aplicações científicas.',
        lacuna_literatura: 'Poucos estudos descrevem a restauração de estado com ownership por projeto.',
        relevancia: 'Evita perda de contexto ao retomar trabalhos acadêmicos.',
      },
      diagnostico: 'Contexto aprovado para a fixture de restauração.',
      lacunas: [],
      texto_sugerido: 'A persistência remota do progresso favorece a continuidade de trabalhos acadêmicos orientados por software.',
      status: 'aprovado',
    },
    objetivo: {
      respostas_usuario: {
        objetivo_geral: 'Validar a restauração visual do progresso remoto no DARCY.',
        objetivos_especificos: 'Carregar o Project; consultar o JSONB; hidratar o estado.',
      },
      diagnostico: 'Objetivo aguardando validação do usuário.',
      lacunas: ['Confirmar visualmente os dados restaurados no navegador.'],
      texto_sugerido: 'Este estudo tem como objetivo validar a restauração visual de um progresso remoto persistido no DARCY.',
      status: 'em_revisao',
    },
    metodologia: { ...etapaPendente },
    fundamentacao_teorica: { ...etapaPendente },
    resultados: { ...etapaPendente, tipo: '' },
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

async function run() {
  const suffix = Date.now().toString(36)
  const createResponse = await apiRequest('POST', '/api/projects', {
    title: `${fixturePrefix}${suffix}`,
    field: 'Validação manual da Fase 3C',
    type: 'resumo-academico',
  })

  if (createResponse.status !== 201 || typeof createResponse.data?.project?.id !== 'string') {
    throw new Error('Não foi possível criar o Project da fixture.')
  }

  const projectId = createResponse.data.project.id
  const progressPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`

  const initialGet = await apiRequest('GET', progressPath)
  if (initialGet.status !== 200 || initialGet.data?.ok !== true || initialGet.data.progress !== null) {
    throw new Error(`A fixture foi criada, mas o progresso inicial não está nulo. Project ID: ${projectId}`)
  }

  const progress = createFixtureProgress()
  const putResponse = await apiRequest('PUT', progressPath, { progress })
  if (putResponse.status !== 200 || putResponse.data?.ok !== true || putResponse.data?.progress?.tema !== progress.tema) {
    throw new Error(`A fixture foi criada, mas o progresso não foi persistido. Project ID: ${projectId}`)
  }

  const savedGet = await apiRequest('GET', progressPath)
  const savedProgress = savedGet.data?.progress
  const savedCorrectly = savedGet.status === 200 &&
    savedGet.data?.ok === true &&
    savedProgress?.tema === progress.tema &&
    savedProgress?.estagio_pesquisa === progress.estagio_pesquisa &&
    savedProgress?.contexto?.status === 'aprovado' &&
    savedProgress?.objetivo?.status === 'em_revisao' &&
    savedProgress?.objetivo?.texto_sugerido === progress.objetivo.texto_sugerido

  if (!savedCorrectly) {
    throw new Error(`A fixture foi criada, mas a leitura posterior não confirmou o estado salvo. Project ID: ${projectId}`)
  }

  console.log(`PROJECT_ID=${projectId}`)
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : 'Falha não identificada ao preparar a fixture.'
  console.error(`FIXTURE_NAO_PREPARADA: ${message}`)
  process.exitCode = 1
})
