import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { assertResumoHistoryE2EBackendIdentity } from '../config/resumoHistoryE2eEnvironment'
import type { ResumoAcademicoState } from '../schemas/resumoAcademico.schema'

interface ApiResponse {
  status: number
  body: unknown
}

interface HistoryEvent {
  id: string
  projectId: string
  sequence: number
  type: string
  actor: string
  section: string | null
  summary: string
  contentVersionRef: string | null
  createdAt: string
}

interface HistoryPage {
  events: HistoryEvent[]
  nextCursor: number | null
}

export interface ResumoHistoryE2EReport {
  initialEventCount: number
  finalEventCount: number
  minimumSequence: number
  maximumSequence: number
  concurrentWriteStatuses: [number, number]
  ownershipStatus: number
  firstPageEventCount: number
  secondPageEventCount: number
  cleanup: {
    deletionStatus: number
    verificationStatus: number
  }
}

const EVENT_FIELDS = new Set([
  'id', 'projectId', 'sequence', 'type', 'actor', 'section', 'summary', 'contentVersionRef', 'createdAt',
])

function requireEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Configuração E2E ausente: ${name}.`)
  return value
}

function assertCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function createSection(): ResumoAcademicoState['contexto'] {
  return { respostas_usuario: {}, diagnostico: '', lacunas: [], texto_sugerido: '', status: 'pendente' }
}

function createProgress(): ResumoAcademicoState {
  return {
    titulo_provisorio: '', tema: 'Teste sintético de histórico científico', area_conhecimento: '', nivel_academico: 'Mestrado', estagio_pesquisa: 'em_andamento',
    contexto: createSection(), objetivo: createSection(), metodologia: createSection(), fundamentacao_teorica: createSection(), resultados: { ...createSection(), tipo: '' },
    resumo_completo: '', numero_palavras: 0, limite_palavras: 250,
    avaliacao_final: { coerencia: '', clareza: '', coesao: '', adequacao_academica: '', problemas_identificados: [], sugestoes: [] },
  }
}

function getHistoryPage(value: unknown): HistoryPage | undefined {
  if (!isRecord(value) || !isRecord(value.history) || !Array.isArray(value.history.events)) return undefined
  const events = value.history.events
  const validEvents = events.every((event) => (
    isRecord(event) && typeof event.id === 'string' && typeof event.projectId === 'string' &&
    typeof event.sequence === 'number' && typeof event.type === 'string' && typeof event.actor === 'string' &&
    (typeof event.section === 'string' || event.section === null) && typeof event.summary === 'string' &&
    (typeof event.contentVersionRef === 'string' || event.contentVersionRef === null) && typeof event.createdAt === 'string'
  ))
  const nextCursor = value.history.nextCursor
  if (!validEvents || (typeof nextCursor !== 'number' && nextCursor !== null)) return undefined
  return { events: events as HistoryEvent[], nextCursor }
}

async function requestApi(path: string, token: string, init: RequestInit = {}): Promise<ApiResponse> {
  const response = await fetch(`${requireEnvironmentValue('DARCY_E2E_API_BASE_URL')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  })
  let body: unknown
  try { body = await response.json() as unknown } catch { /* status ainda é verificável */ }
  return { status: response.status, body }
}

async function authenticateE2EUser(user: 'A' | 'B'): Promise<string> {
  const client = createClient(
    requireEnvironmentValue('SUPABASE_URL'),
    requireEnvironmentValue('SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({
    email: requireEnvironmentValue(`DARCY_E2E_USER_${user}_EMAIL`),
    password: requireEnvironmentValue(`DARCY_E2E_USER_${user}_PASSWORD`),
  })
  if (error || !data.session?.access_token) throw new Error(`Não foi possível autenticar a conta E2E ${user}.`)
  return data.session.access_token
}

async function assertBackendIdentity(): Promise<void> {
  const response = await fetch(`${requireEnvironmentValue('DARCY_E2E_API_BASE_URL')}/api/darcy/health`)
  let payload: unknown
  try { payload = await response.json() as unknown } catch { /* validador abaixo falha sem expor corpo */ }
  assertCondition(response.status === 200, 'O backend E2E não respondeu ao health check.')
  assertResumoHistoryE2EBackendIdentity(payload)
}

function assertSafeEvents(events: HistoryEvent[], marker: string): void {
  for (const event of events) {
    assertCondition(Object.keys(event).every((key) => EVENT_FIELDS.has(key)), 'Evento contém campo não permitido.')
    assertCondition(!event.summary.includes(marker), 'Evento expõe texto integral sintético.')
    assertCondition(event.contentVersionRef === null, 'Evento de histórico não deve armazenar versão textual nesta etapa.')
  }
}

async function cleanupProject(projectId: string, token: string): Promise<ResumoHistoryE2EReport['cleanup']> {
  const deletion = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token, { method: 'DELETE' })
  const verification = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token)
  if (deletion.status !== 204 || verification.status !== 404) {
    throw new Error(`A limpeza do projeto sintético falhou. Identificador remanescente: ${projectId}`)
  }
  return { deletionStatus: deletion.status, verificationStatus: verification.status }
}

export async function runResumoAcademicoHistoryE2E(): Promise<ResumoHistoryE2EReport> {
  await assertBackendIdentity()
  const tokenA = await authenticateE2EUser('A')
  const tokenB = await authenticateE2EUser('B')
  const [bootstrapA, bootstrapB] = await Promise.all([requestApi('/api/auth/me', tokenA), requestApi('/api/auth/me', tokenB)])
  assertCondition(bootstrapA.status === 200 && bootstrapB.status === 200, 'Não foi possível preparar perfis E2E.')

  const creation = await requestApi('/api/projects', tokenA, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `E2E histórico ${randomUUID()}`, field: 'Teste sintético isolado', type: 'resumo-academico' }),
  })
  const project = isRecord(creation.body) && isRecord(creation.body.project) ? creation.body.project : undefined
  const projectId = typeof project?.id === 'string' ? project.id : undefined
  assertCondition(creation.status === 201 && projectId, 'Não foi possível criar o projeto sintético E2E.')

  try {
    const marker = 'MARCADOR_SINTETICO_NAO_PERSISTIR'
    const initial = createProgress()
    initial.contexto.texto_sugerido = marker
    initial.contexto.status = 'aprovado'
    initial.decisoes_autorais = [{ id: 'contexto_problema_central', escolha: 'Escolha sintética', justificativa: marker, atualizada_em: '2026-10-23T12:00:00.000Z' }]
    initial.classificacao_cnpq = { versao_catalogo: 'cnpq-tac-2013-04-25', primaria: { codigo: '7.08.00.00-6', nome: 'Educação', nivel: 'area', caminho_codigos: ['7.00.00.00-0', '7.08.00.00-6'] } }
    initial.resumo_completo = marker
    const initialSave = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: initial }),
    })
    assertCondition(initialSave.status === 200, `Persistência inicial retornou HTTP ${initialSave.status}.`)

    const regenerated = structuredClone(initial)
    regenerated.contexto.texto_sugerido = `${marker}_REGENERADO`
    const regeneration = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: regenerated }),
    })
    assertCondition(regeneration.status === 200, `Regeneração retornou HTTP ${regeneration.status}.`)

    const initialHistoryResponse = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/history?limit=100`, tokenA)
    const initialHistory = getHistoryPage(initialHistoryResponse.body)
    assertCondition(initialHistoryResponse.status === 200 && initialHistory, 'Não foi possível recuperar o histórico inicial.')
    for (const type of ['rascunho_gerado', 'rascunho_regenerado', 'secao_aprovada', 'decisao_autoral_alterada', 'classificacao_cientifica_alterada', 'resumo_consolidado']) {
      assertCondition(initialHistory.events.some((event) => event.type === type), `Evento esperado ausente: ${type}.`)
    }
    assertSafeEvents(initialHistory.events, marker)

    const noOp = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: regenerated }),
    })
    assertCondition(noOp.status === 200, `Autosave idêntico retornou HTTP ${noOp.status}.`)
    const afterNoOpResponse = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/history?limit=100`, tokenA)
    const afterNoOp = getHistoryPage(afterNoOpResponse.body)
    assertCondition(afterNoOpResponse.status === 200 && afterNoOp, 'Não foi possível verificar o autosave idêntico.')
    assertCondition(afterNoOp.events.length === initialHistory.events.length, 'Autosave idêntico criou evento adicional.')

    const concurrentA = structuredClone(regenerated)
    concurrentA.objetivo.texto_sugerido = 'OBJETIVO_SINTETICO_A'
    const concurrentB = structuredClone(regenerated)
    concurrentB.metodologia.texto_sugerido = 'METODOLOGIA_SINTETICA_B'
    const [writeA, writeB] = await Promise.all([
      requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`, tokenA, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: concurrentA }) }),
      requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`, tokenA, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: concurrentB }) }),
    ])
    assertCondition(writeA.status === 200 && writeB.status === 200, 'Gravação concorrente não foi concluída.')

    const finalHistoryResponse = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/history?limit=100`, tokenA)
    const finalHistory = getHistoryPage(finalHistoryResponse.body)
    assertCondition(finalHistoryResponse.status === 200 && finalHistory, 'Não foi possível recuperar o histórico final.')
    const sequences = finalHistory.events.map((event) => event.sequence)
    assertCondition(new Set(sequences).size === sequences.length, 'Foram encontradas sequências duplicadas.')
    assertCondition(sequences.every((sequence, index) => index === 0 || sequences[index - 1] > sequence), 'A ordenação por sequência não é determinística.')
    assertSafeEvents(finalHistory.events, marker)

    const firstPageResponse = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/history?limit=2`, tokenA)
    const firstPage = getHistoryPage(firstPageResponse.body)
    assertCondition(firstPageResponse.status === 200 && firstPage?.events.length === 2 && firstPage.nextCursor !== null, 'Primeira página inválida.')
    const secondPageResponse = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/history?limit=2&beforeSequence=${firstPage.nextCursor}`, tokenA)
    const secondPage = getHistoryPage(secondPageResponse.body)
    assertCondition(secondPageResponse.status === 200 && secondPage && secondPage.events.length > 0, 'Segunda página inválida.')
    const firstPageSequences = new Set(firstPage.events.map((event) => event.sequence))
    assertCondition(secondPage.events.every((event) => !firstPageSequences.has(event.sequence)), 'A paginação repetiu eventos.')

    const foreignHistory = await requestApi(`/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/history`, tokenB)
    assertCondition(foreignHistory.status === 404, 'Ownership não bloqueou a segunda conta E2E.')
    const cleanup = await cleanupProject(projectId, tokenA)
    return {
      initialEventCount: initialHistory.events.length,
      finalEventCount: finalHistory.events.length,
      minimumSequence: Math.min(...sequences), maximumSequence: Math.max(...sequences),
      concurrentWriteStatuses: [writeA.status, writeB.status], ownershipStatus: foreignHistory.status,
      firstPageEventCount: firstPage.events.length, secondPageEventCount: secondPage.events.length, cleanup,
    }
  } catch (error) {
    await cleanupProject(projectId, tokenA)
    throw error
  }
}

if (require.main === module) {
  runResumoAcademicoHistoryE2E()
    .then((report) => console.log(JSON.stringify({ result: 'approved', ...report })))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Falha no teste E2E de histórico.'
      console.error(`[DARCY E2E histórico] ${message}`)
      process.exitCode = 1
    })
}
