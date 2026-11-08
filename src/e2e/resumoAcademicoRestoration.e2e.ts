import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { assertResumoHistoryE2EBackendIdentity } from '../config/resumoHistoryE2eEnvironment'
import type { ResumoAcademicoState } from '../schemas/resumoAcademico.schema'

interface ApiResponse { status: number; body: unknown }

interface ProgressSnapshot { progress: unknown; revision: number }

interface HistoryEvent {
  id: string
  type: string
  sequence: number
  contentVersionRef: string | null
}

interface TextVersion {
  id: string
  projectId: string
  scopeKey: string
  section: string | null
  versionNumber: number
  progressRevision: number
  origin: string
  content: string
  previousVersionId: string | null
  sourceEventId: string | null
}

export interface ResumoAcademicoRestorationE2EReport {
  firstRestoreStatus: number
  idempotentRestoreStatus: number
  secondRestoreStatus: number
  concurrentRestoreStatuses: [number, number]
  staleRestoreStatus: number
  foreignRestoreStatus: number
  missingVersionStatus: number
  restoredRevisions: number[]
  cleanup: { deletionStatus: number; verificationStatus: number }
}

const SYNTHETIC_MARKER = `E2E_RESTORE_${randomUUID()}`

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
  try { body = await response.json() as unknown } catch { /* o status permanece verificável */ }
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
  try { payload = await response.json() as unknown } catch { /* o validador abaixo falha sem expor o corpo */ }
  assertCondition(response.status === 200, 'O backend E2E não respondeu ao health check.')
  assertResumoHistoryE2EBackendIdentity(payload)
}

function createSection(): ResumoAcademicoState['contexto'] {
  return { respostas_usuario: {}, diagnostico: '', lacunas: [], texto_sugerido: '', status: 'pendente' }
}

function createProgress(): ResumoAcademicoState {
  return {
    titulo_provisorio: '', tema: 'Teste sintético de restauração acadêmica', area_conhecimento: '', nivel_academico: 'Mestrado', estagio_pesquisa: 'em_andamento',
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
  const events = value.history.events
  if (!events.every((event) => isRecord(event)
    && typeof event.id === 'string'
    && typeof event.type === 'string'
    && typeof event.sequence === 'number'
    && (typeof event.contentVersionRef === 'string' || event.contentVersionRef === null))) return undefined
  return events as HistoryEvent[]
}

function getVersion(value: unknown): TextVersion | undefined {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.version)) return undefined
  const version = value.version
  if (
    typeof version.id !== 'string'
    || typeof version.projectId !== 'string'
    || typeof version.scopeKey !== 'string'
    || (typeof version.section !== 'string' && version.section !== null)
    || typeof version.versionNumber !== 'number'
    || typeof version.progressRevision !== 'number'
    || typeof version.origin !== 'string'
    || typeof version.content !== 'string'
    || (typeof version.previousVersionId !== 'string' && version.previousVersionId !== null)
    || (typeof version.sourceEventId !== 'string' && version.sourceEventId !== null)
  ) return undefined
  return version as unknown as TextVersion
}

function getProjectId(value: unknown): string | undefined {
  return isRecord(value) && isRecord(value.project) && typeof value.project.id === 'string'
    ? value.project.id
    : undefined
}

function hasRevisionConflict(value: unknown): boolean {
  return isRecord(value) && isRecord(value.error) && value.error.code === 'RESUMO_PROGRESS_REVISION_CONFLICT'
}

function getContextText(progress: unknown): string | undefined {
  if (!isRecord(progress) || !isRecord(progress.contexto)) return undefined
  return typeof progress.contexto.texto_sugerido === 'string' ? progress.contexto.texto_sugerido : undefined
}

function getContextStatus(progress: unknown): string | undefined {
  if (!isRecord(progress) || !isRecord(progress.contexto)) return undefined
  return typeof progress.contexto.status === 'string' ? progress.contexto.status : undefined
}

function preservedProgressFields(progress: unknown, expectedObjective: string, expectedDecision: string): boolean {
  if (!isRecord(progress) || !isRecord(progress.objetivo) || !Array.isArray(progress.decisoes_autorais) || !isRecord(progress.classificacao_cnpq)) return false
  const decision = progress.decisoes_autorais[0]
  return progress.objetivo.texto_sugerido === expectedObjective
    && isRecord(decision)
    && decision.justificativa === expectedDecision
    && isRecord(progress.classificacao_cnpq.primaria)
    && typeof progress.classificacao_cnpq.primaria.codigo === 'string'
}

async function cleanupProject(projectId: string, token: string): Promise<ResumoAcademicoRestorationE2EReport['cleanup']> {
  const deletion = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token, { method: 'DELETE' })
  const verification = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token)
  if (deletion.status !== 204 || verification.status !== 404) {
    throw new Error(`Limpeza sintética incompleta. Identificador remanescente: ${projectId}`)
  }
  return { deletionStatus: deletion.status, verificationStatus: verification.status }
}

async function restoreVersion(
  progressPath: string,
  versionId: string,
  token: string,
  expectedRevision: number,
  operationId: string,
): Promise<ApiResponse> {
  return requestApi(`${progressPath}/versions/${encodeURIComponent(versionId)}/restore`, token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ expectedRevision, operationId }),
  })
}

export async function runResumoAcademicoRestorationE2E(): Promise<ResumoAcademicoRestorationE2EReport> {
  await assertBackendIdentity()
  const tokenA = await authenticateE2EUser('A')
  const tokenB = await authenticateE2EUser('B')
  const creation = await requestApi('/api/projects', tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: `${SYNTHETIC_MARKER} resumo`,
      field: 'Teste sintético isolado de restauração',
      type: 'resumo-academico',
    }),
  })
  const projectId = getProjectId(creation.body)
  assertCondition(creation.status === 201 && projectId, 'Não foi possível criar o projeto sintético de restauração.')

  try {
    const progressPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`
    const initialResponse = await requestApi(progressPath, tokenA)
    const initial = getProgressSnapshot(initialResponse.body)
    assertCondition(initialResponse.status === 200 && initial?.progress === null && initial.revision === 0, 'O projeto sintético não iniciou com revisão zero.')

    const expectedObjective = `${SYNTHETIC_MARKER}_OBJETIVO`
    const expectedDecision = `${SYNTHETIC_MARKER}_DECISAO`
    const firstText = `${SYNTHETIC_MARKER}_CONTEXTO_ANTERIOR`
    const secondText = `${SYNTHETIC_MARKER}_CONTEXTO_ATUALIZADO`
    const persisted = createProgress()
    persisted.contexto.texto_sugerido = firstText
    persisted.objetivo.texto_sugerido = expectedObjective
    persisted.decisoes_autorais = [{ id: 'contexto_problema_central', escolha: 'Escolha sintética', justificativa: expectedDecision, atualizada_em: '2026-11-08T12:00:00.000Z' }]
    persisted.classificacao_cnpq = { versao_catalogo: 'cnpq-tac-2013-04-25', primaria: { codigo: '7.08.00.00-6', nome: 'Educação', nivel: 'area', caminho_codigos: ['7.00.00.00-0', '7.08.00.00-6'] } }

    const firstSave = await requestApi(progressPath, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: persisted, expectedRevision: 0 }),
    })
    const firstSaveSnapshot = getProgressSnapshot(firstSave.body)
    assertCondition(firstSave.status === 200 && firstSaveSnapshot?.revision === 1, 'O autosave inicial não confirmou revisão 1.')

    const firstApprovalState = structuredClone(persisted)
    firstApprovalState.contexto.status = 'aprovado'
    const firstApproval = await requestApi(`${progressPath}/sections/contexto/approve`, tokenA, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: firstApprovalState, expectedRevision: 1 }),
    })
    const firstApprovalSnapshot = getProgressSnapshot(firstApproval.body)
    assertCondition(firstApproval.status === 200 && firstApprovalSnapshot?.revision === 2, 'A primeira aprovação não confirmou revisão 2.')

    const changedState = structuredClone(firstApprovalState)
    changedState.contexto.texto_sugerido = secondText
    changedState.contexto.status = 'em_revisao'
    const textChange = await requestApi(progressPath, tokenA, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: changedState, expectedRevision: 2 }),
    })
    const textChangeSnapshot = getProgressSnapshot(textChange.body)
    assertCondition(textChange.status === 200 && textChangeSnapshot?.revision === 3, 'A alteração do texto não confirmou revisão 3.')

    const secondApprovalState = structuredClone(changedState)
    secondApprovalState.contexto.status = 'aprovado'
    const secondApproval = await requestApi(`${progressPath}/sections/contexto/approve`, tokenA, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: secondApprovalState, expectedRevision: 3 }),
    })
    const secondApprovalSnapshot = getProgressSnapshot(secondApproval.body)
    assertCondition(secondApproval.status === 200 && secondApprovalSnapshot?.revision === 4, 'A segunda aprovação não confirmou revisão 4.')

    const beforeRestorationResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const beforeRestorationHistory = getHistoryEvents(beforeRestorationResponse.body)
    assertCondition(beforeRestorationResponse.status === 200 && beforeRestorationHistory, 'Não foi possível carregar os marcos de versão anteriores.')
    const approvalEvents = beforeRestorationHistory.filter((event) => event.type === 'secao_aprovada' && event.contentVersionRef !== null)
    assertCondition(approvalEvents.length >= 2, 'As duas versões anteriores não foram vinculadas a eventos de aprovação.')
    const [secondApprovalEvent, firstApprovalEvent] = approvalEvents
    assertCondition(secondApprovalEvent.contentVersionRef !== null && firstApprovalEvent.contentVersionRef !== null, 'Evento de aprovação sem referência de versão.')
    const firstVersionId = firstApprovalEvent.contentVersionRef
    const secondVersionId = secondApprovalEvent.contentVersionRef
    assertCondition(firstVersionId !== secondVersionId, 'As aprovações distintas apontam para a mesma versão.')

    const firstSourceResponse = await requestApi(`${progressPath}/versions/${encodeURIComponent(firstVersionId)}`, tokenA)
    const secondSourceResponse = await requestApi(`${progressPath}/versions/${encodeURIComponent(secondVersionId)}`, tokenA)
    const firstSource = getVersion(firstSourceResponse.body)
    const secondSource = getVersion(secondSourceResponse.body)
    assertCondition(firstSourceResponse.status === 200 && secondSourceResponse.status === 200 && firstSource && secondSource, 'Não foi possível consultar as versões-fonte.')
    assertCondition(firstSource.content === firstText && secondSource.content === secondText, 'Os textos das versões-fonte não correspondem aos marcos aprovados.')

    const firstOperation = `restore-${randomUUID()}`
    const firstRestore = await restoreVersion(progressPath, firstSource.id, tokenA, 4, firstOperation)
    const firstRestoreSnapshot = getProgressSnapshot(firstRestore.body)
    assertCondition(firstRestore.status === 200 && firstRestoreSnapshot?.revision === 5, 'A restauração inicial não confirmou HTTP 200 e revisão 5.')
    assertCondition(getContextText(firstRestoreSnapshot.progress) === firstText && getContextStatus(firstRestoreSnapshot.progress) === 'em_revisao', 'A restauração não recuperou o texto ou estado esperado.')
    assertCondition(preservedProgressFields(firstRestoreSnapshot.progress, expectedObjective, expectedDecision), 'A restauração alterou classificação, decisão autoral ou outra seção.')
    assertCondition(isRecord(firstRestore.body) && typeof firstRestore.body.versionId === 'string', 'A restauração não retornou a nova versão.')
    const firstRestoredVersionId = firstRestore.body.versionId

    const afterFirstRestoreResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const afterFirstRestoreHistory = getHistoryEvents(afterFirstRestoreResponse.body)
    assertCondition(afterFirstRestoreResponse.status === 200 && afterFirstRestoreHistory, 'Não foi possível consultar o histórico após a restauração.')
    const firstRestoreEvent = afterFirstRestoreHistory.find((event) => event.type === 'restauracao' && event.contentVersionRef === firstRestoredVersionId)
    assertCondition(firstRestoreEvent, 'O evento de restauração não foi vinculado à nova versão.')
    const firstRestoredVersionResponse = await requestApi(`${progressPath}/versions/${encodeURIComponent(firstRestoredVersionId)}`, tokenA)
    const firstRestoredVersion = getVersion(firstRestoredVersionResponse.body)
    assertCondition(
      firstRestoredVersionResponse.status === 200
        && firstRestoredVersion?.origin === 'restauracao'
        && firstRestoredVersion.previousVersionId === firstSource.id
        && firstRestoredVersion.content === firstText,
      'A versão de restauração não preservou origem, linhagem ou conteúdo.',
    )

    const idempotentRestore = await restoreVersion(progressPath, firstSource.id, tokenA, 4, firstOperation)
    const idempotentSnapshot = getProgressSnapshot(idempotentRestore.body)
    assertCondition(idempotentRestore.status === 200 && idempotentSnapshot?.revision === 5, 'O reenvio idempotente não devolveu a revisão persistida.')
    assertCondition(isRecord(idempotentRestore.body) && idempotentRestore.body.versionId === firstRestoredVersionId, 'O reenvio idempotente criou uma nova versão.')
    const afterIdempotentResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const afterIdempotentHistory = getHistoryEvents(afterIdempotentResponse.body)
    assertCondition(afterIdempotentHistory?.length === afterFirstRestoreHistory.length, 'O reenvio idempotente criou evento adicional.')

    const secondRestore = await restoreVersion(progressPath, secondSource.id, tokenA, 5, `restore-${randomUUID()}`)
    const secondRestoreSnapshot = getProgressSnapshot(secondRestore.body)
    assertCondition(secondRestore.status === 200 && secondRestoreSnapshot?.revision === 6, 'A segunda restauração intencional não confirmou revisão 6.')
    assertCondition(getContextText(secondRestoreSnapshot.progress) === secondText, 'A segunda restauração não aplicou o conteúdo selecionado.')

    const concurrentRevision = secondRestoreSnapshot.revision
    const [concurrentA, concurrentB] = await Promise.all([
      restoreVersion(progressPath, firstSource.id, tokenA, concurrentRevision, `restore-${randomUUID()}`),
      restoreVersion(progressPath, secondSource.id, tokenA, concurrentRevision, `restore-${randomUUID()}`),
    ])
    const concurrentStatuses: [number, number] = [concurrentA.status, concurrentB.status]
    const concurrentSuccess = concurrentA.status === 200 ? concurrentA : concurrentB.status === 200 ? concurrentB : undefined
    const concurrentConflict = concurrentA.status === 409 ? concurrentA : concurrentB.status === 409 ? concurrentB : undefined
    assertCondition(
      Boolean(concurrentSuccess) && Boolean(concurrentConflict) && concurrentStatuses[0] !== concurrentStatuses[1] && hasRevisionConflict(concurrentConflict?.body),
      'Restaurações concorrentes não produziram exatamente um HTTP 200 e um HTTP 409.',
    )
    const concurrentSnapshot = getProgressSnapshot(concurrentSuccess?.body)
    assertCondition(concurrentSnapshot?.revision === 7, 'A restauração concorrente vencedora não confirmou revisão 7.')
    const expectedConcurrentText = concurrentA.status === 200 ? firstText : secondText
    assertCondition(getContextText(concurrentSnapshot.progress) === expectedConcurrentText, 'O estado vencedor da restauração concorrente não permaneceu no retorno confirmado.')
    const concurrentHistoryResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const concurrentHistory = getHistoryEvents(concurrentHistoryResponse.body)
    assertCondition(concurrentHistory && concurrentHistory.filter((event) => event.type === 'restauracao').length === 3, 'O conflito concorrente criou evento de restauração adicional.')

    const staleHistoryLength = concurrentHistory.length
    const staleRestore = await restoreVersion(progressPath, firstSource.id, tokenA, 6, `restore-${randomUUID()}`)
    assertCondition(staleRestore.status === 409 && hasRevisionConflict(staleRestore.body), 'A revisão obsoleta não retornou HTTP 409.')
    const afterStaleResponse = await requestApi(`${progressPath}/history?limit=100`, tokenA)
    const afterStaleHistory = getHistoryEvents(afterStaleResponse.body)
    assertCondition(afterStaleHistory?.length === staleHistoryLength, 'A restauração obsoleta criou efeito parcial no histórico.')

    const foreignRestore = await restoreVersion(progressPath, firstSource.id, tokenB, concurrentSnapshot.revision, `restore-${randomUUID()}`)
    const missingRestore = await restoreVersion(progressPath, 'missing-synthetic-version', tokenA, concurrentSnapshot.revision, `restore-${randomUUID()}`)
    assertCondition(foreignRestore.status === 404 && missingRestore.status === 404, 'Ownership ou versão inexistente não retornaram HTTP 404.')

    const finalProgressResponse = await requestApi(progressPath, tokenA)
    const finalProgress = getProgressSnapshot(finalProgressResponse.body)
    assertCondition(finalProgressResponse.status === 200 && finalProgress?.revision === 7, 'A consulta final não confirmou a revisão vencedora.')
    assertCondition(getContextText(finalProgress.progress) === expectedConcurrentText, 'A consulta final não preservou o texto vencedor da restauração concorrente.')
    assertCondition(preservedProgressFields(finalProgress.progress, expectedObjective, expectedDecision), 'A consulta final identificou alteração indevida em campos preservados.')

    const cleanup = await cleanupProject(projectId, tokenA)
    return {
      firstRestoreStatus: firstRestore.status,
      idempotentRestoreStatus: idempotentRestore.status,
      secondRestoreStatus: secondRestore.status,
      concurrentRestoreStatuses: concurrentStatuses,
      staleRestoreStatus: staleRestore.status,
      foreignRestoreStatus: foreignRestore.status,
      missingVersionStatus: missingRestore.status,
      restoredRevisions: [firstRestoreSnapshot.revision, secondRestoreSnapshot.revision, concurrentSnapshot.revision],
      cleanup,
    }
  } catch (error) {
    try {
      await cleanupProject(projectId, tokenA)
    } catch {
      throw new Error(`Falha no cenário e limpeza pendente para projeto sintético: ${projectId}`)
    }
    throw error
  }
}

if (require.main === module) {
  runResumoAcademicoRestorationE2E()
    .then((report) => console.log(JSON.stringify({ result: 'approved', ...report })))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Falha no teste E2E de restauração acadêmica.'
      console.error(`[DARCY E2E restauração] ${message}`)
      process.exitCode = 1
    })
}
