import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { assertResumoHistoryE2EBackendIdentity } from '../config/resumoHistoryE2eEnvironment'
import type { ResumoAcademicoState } from '../schemas/resumoAcademico.schema'

interface ApiResponse { status: number; body: unknown }

interface HistoryEvent {
  type: string
  sequence: number
  contentVersionRef: string | null
}

interface ProgressSnapshot { progress: unknown; revision: number }

export interface ResumoAcademicoMilestonesE2EReport {
  invalidApprovalStatus: number
  approvalStatus: number
  approvalRevision: number
  duplicateApprovalStatus: number
  concurrentConsolidationStatuses: [number, number]
  ownershipStatus: number
  versionedMilestoneCount: number
  cleanup: { deletionStatus: number; verificationStatus: number }
}

const SYNTHETIC_MARKER = `E2E_MILESTONE_${randomUUID()}`

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

async function requestApi(path: string, token: string, init: RequestInit = {}): Promise<ApiResponse> {
  const response = await fetch(`${requireEnvironmentValue('DARCY_E2E_API_BASE_URL')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  })
  let body: unknown
  try { body = await response.json() as unknown } catch { /* status permanece verificável */ }
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
  try { payload = await response.json() as unknown } catch { /* validador abaixo falha sem corpo */ }
  assertCondition(response.status === 200, 'O backend E2E não respondeu ao health check.')
  assertResumoHistoryE2EBackendIdentity(payload)
}

function createSection(): ResumoAcademicoState['contexto'] {
  return { respostas_usuario: {}, diagnostico: '', lacunas: [], texto_sugerido: '', status: 'pendente' }
}

function createProgress(): ResumoAcademicoState {
  return {
    titulo_provisorio: '', tema: 'Teste sintético de marcos acadêmicos', area_conhecimento: '', nivel_academico: 'Mestrado', estagio_pesquisa: 'em_andamento',
    contexto: createSection(), objetivo: createSection(), metodologia: createSection(), fundamentacao_teorica: createSection(), resultados: { ...createSection(), tipo: '' },
    resumo_completo: '', numero_palavras: 0, limite_palavras: 250,
    avaliacao_final: { coerencia: '', clareza: '', coesao: '', adequacao_academica: '', problemas_identificados: [], sugestoes: [] },
  }
}

function getProgressSnapshot(value: unknown): ProgressSnapshot | undefined {
  if (!isRecord(value) || value.ok !== true || !Object.prototype.hasOwnProperty.call(value, 'progress')) return undefined
  return typeof value.revision === 'number' && Number.isInteger(value.revision) && value.revision >= 0
    ? { progress: value.progress, revision: value.revision }
    : undefined
}

function getHistoryEvents(value: unknown): HistoryEvent[] | undefined {
  if (!isRecord(value) || !isRecord(value.history) || !Array.isArray(value.history.events)) return undefined
  return value.history.events.filter((event): event is HistoryEvent => (
    isRecord(event)
      && typeof event.type === 'string'
      && typeof event.sequence === 'number'
      && (typeof event.contentVersionRef === 'string' || event.contentVersionRef === null)
  ))
}

function getProjectId(value: unknown): string | undefined {
  if (!isRecord(value) || !isRecord(value.project) || typeof value.project.id !== 'string') return undefined
  return value.project.id
}

async function cleanupProject(projectId: string, token: string): Promise<ResumoAcademicoMilestonesE2EReport['cleanup']> {
  const deletion = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token, { method: 'DELETE' })
  const verification = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token)
  if (deletion.status !== 204 || verification.status !== 404) {
    throw new Error(`Limpeza sintética incompleta. Identificador remanescente: ${projectId}`)
  }
  return { deletionStatus: deletion.status, verificationStatus: verification.status }
}

export async function runResumoAcademicoMilestonesE2E(): Promise<ResumoAcademicoMilestonesE2EReport> {
  await assertBackendIdentity()
  const tokenA = await authenticateE2EUser('A')
  const tokenB = await authenticateE2EUser('B')
  const creation = await requestApi('/api/projects', tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: `${SYNTHETIC_MARKER} resumo`, field: 'Teste sintético de marcos', type: 'resumo-academico' }),
  })
  const projectId = getProjectId(creation.body)
  assertCondition(creation.status === 201 && projectId, 'Não foi possível criar o projeto sintético de marcos.')

  try {
    const progressPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`
    const initial = await requestApi(progressPath, tokenA)
    const initialSnapshot = getProgressSnapshot(initial.body)
    assertCondition(initial.status === 200 && initialSnapshot?.progress === null && initialSnapshot.revision === 0, 'GET inicial não retornou revisão zero.')

    const persisted = createProgress()
    persisted.contexto.texto_sugerido = `${SYNTHETIC_MARKER}_TEXTO`
    const autosave = await requestApi(progressPath, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: persisted, expectedRevision: 0 }),
    })
    const autosaveSnapshot = getProgressSnapshot(autosave.body)
    assertCondition(autosave.status === 200 && autosaveSnapshot?.revision === 1, 'Autosave inicial não confirmou revisão 1.')

    const invalidApproval = structuredClone(persisted)
    invalidApproval.contexto.texto_sugerido = ''
    invalidApproval.contexto.status = 'aprovado'
    const invalid = await requestApi(`${progressPath}/sections/contexto/approve`, tokenA, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: invalidApproval, expectedRevision: 1 }),
    })
    assertCondition(invalid.status === 422, 'A aprovação sem texto persistido não foi bloqueada com HTTP 422.')

    const beforeApprovalHistory = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const beforeApprovalEvents = getHistoryEvents(beforeApprovalHistory.body)
    assertCondition(beforeApprovalHistory.status === 200 && beforeApprovalEvents, 'Não foi possível verificar o histórico antes da aprovação.')

    const approved = structuredClone(persisted)
    approved.contexto.status = 'aprovado'
    const approval = await requestApi(`${progressPath}/sections/contexto/approve`, tokenA, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: approved, expectedRevision: 1 }),
    })
    const approvalSnapshot = getProgressSnapshot(approval.body)
    assertCondition(approval.status === 200 && approvalSnapshot?.revision === 2, 'A aprovação não confirmou revisão 2.')

    const afterApprovalHistory = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const afterApprovalEvents = getHistoryEvents(afterApprovalHistory.body)
    assertCondition(afterApprovalHistory.status === 200 && afterApprovalEvents, 'Não foi possível verificar o evento de aprovação.')
    assertCondition(afterApprovalEvents.length === beforeApprovalEvents.length + 1, 'A aprovação não gerou exatamente um evento.')
    assertCondition(afterApprovalEvents.filter((event) => event.type === 'secao_aprovada').at(-1)?.contentVersionRef !== null, 'A aprovação não vinculou contentVersionRef.')

    const duplicateApproval = await requestApi(`${progressPath}/sections/contexto/approve`, tokenA, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: approved, expectedRevision: 1 }),
    })
    assertCondition(duplicateApproval.status === 409, 'Retry técnico com revisão antiga não retornou HTTP 409.')

    const repeatedApproval = await requestApi(`${progressPath}/sections/contexto/approve`, tokenA, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: approved, expectedRevision: 2 }),
    })
    assertCondition(repeatedApproval.status === 200, 'Segundo marco explícito válido não foi aceito.')
    const repeatedSnapshot = getProgressSnapshot(repeatedApproval.body)
    assertCondition(repeatedSnapshot?.revision === 3, 'Segundo marco não recebeu revisão 3.')

    const consolidated = structuredClone(approved)
    consolidated.resumo_completo = `${SYNTHETIC_MARKER}_RESUMO`
    consolidated.numero_palavras = 1
    const summaryAutosave = await requestApi(progressPath, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ progress: consolidated, expectedRevision: 3 }),
    })
    const summarySnapshot = getProgressSnapshot(summaryAutosave.body)
    assertCondition(summaryAutosave.status === 200 && summarySnapshot?.revision === 4, 'Autosave do resumo não confirmou revisão 4.')

    const beforeConsolidationHistoryResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const beforeConsolidationHistory = getHistoryEvents(beforeConsolidationHistoryResponse.body)
    assertCondition(beforeConsolidationHistoryResponse.status === 200 && beforeConsolidationHistory, 'Não foi possível preparar a verificação de consolidação.')

    const [consolidationA, consolidationB] = await Promise.all([
      requestApi(`${progressPath}/consolidate`, tokenA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: consolidated, expectedRevision: 4 }) }),
      requestApi(`${progressPath}/consolidate`, tokenA, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: consolidated, expectedRevision: 4 }) }),
    ])
    const statuses: [number, number] = [consolidationA.status, consolidationB.status]
    assertCondition(statuses.includes(200) && statuses.includes(409) && statuses[0] !== statuses[1], 'Consolidação concorrente não produziu exatamente 200/409.')

    const historyResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const history = getHistoryEvents(historyResponse.body)
    assertCondition(historyResponse.status === 200 && history, 'Não foi possível recuperar o histórico final.')
    assertCondition(history.length === beforeConsolidationHistory.length + 1, 'O conflito de consolidação criou evento adicional.')
    const versionedMilestones = history.filter((event) => (
      (event.type === 'secao_aprovada' || event.type === 'resumo_consolidado')
      && event.contentVersionRef !== null
    ))
    assertCondition(versionedMilestones.length >= 3, 'Nem todos os marcos explícitos possuem versão vinculada.')
    const sequences = history.map((event) => event.sequence)
    assertCondition(new Set(sequences).size === sequences.length, 'O histórico possui sequências duplicadas.')

    const ownership = await requestApi(progressPath, tokenB)
    assertCondition(ownership.status === 404, 'Ownership não bloqueou a conta B.')

    const cleanup = await cleanupProject(projectId, tokenA)
    return {
      invalidApprovalStatus: invalid.status,
      approvalStatus: approval.status,
      approvalRevision: approvalSnapshot.revision,
      duplicateApprovalStatus: duplicateApproval.status,
      concurrentConsolidationStatuses: statuses,
      ownershipStatus: ownership.status,
      versionedMilestoneCount: versionedMilestones.length,
      cleanup,
    }
  } catch (error) {
    try { await cleanupProject(projectId, tokenA) } catch { /* erro sanitizado abaixo preserva o identificador sintético */ }
    throw error
  }
}

if (require.main === module) {
  runResumoAcademicoMilestonesE2E()
    .then((report) => console.log(JSON.stringify({ result: 'approved', ...report })))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Falha no teste E2E de marcos acadêmicos.'
      console.error(`[DARCY E2E marcos] ${message}`)
      process.exitCode = 1
    })
}
