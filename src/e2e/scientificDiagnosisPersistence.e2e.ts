import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { assertResumoHistoryE2EBackendIdentity } from '../config/resumoHistoryE2eEnvironment'
import type { ResumoAcademicoState } from '../schemas/resumoAcademico.schema'

interface ApiResponse { status: number; body: unknown }
interface AuthenticatedUser { token: string; userId: string }

const marker = `F01_SCIENTIFIC_DIAGNOSIS_${randomUUID()}`

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Configuração E2E ausente: ${name}.`)
  return value
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object'
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function request(path: string, token: string, init: RequestInit = {}): Promise<ApiResponse> {
  const response = await fetch(`${required('DARCY_E2E_API_BASE_URL')}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init.headers },
  })
  let body: unknown
  try { body = await response.json() as unknown } catch { body = undefined }
  return { status: response.status, body }
}

async function authenticate(user: 'A' | 'B'): Promise<AuthenticatedUser> {
  const client = createClient(required('SUPABASE_URL'), required('SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInWithPassword({ email: required(`DARCY_E2E_USER_${user}_EMAIL`), password: required(`DARCY_E2E_USER_${user}_PASSWORD`) })
  if (error || !data.session?.access_token || !data.user?.id) throw new Error(`Não foi possível autenticar a conta E2E ${user}.`)
  return { token: data.session.access_token, userId: data.user.id }
}

function section(): ResumoAcademicoState['contexto'] {
  return { respostas_usuario: {}, diagnostico: '', lacunas: [], texto_sugerido: '', status: 'pendente' }
}

function progress(): ResumoAcademicoState {
  return {
    titulo_provisorio: '', tema: marker, area_conhecimento: '', nivel_academico: 'Mestrado', estagio_pesquisa: 'em_andamento',
    contexto: { ...section(), respostas_usuario: { problema_central: `${marker}_problema` }, texto_sugerido: `${marker}_contexto` },
    objetivo: { ...section(), respostas_usuario: { objetivo_geral: `${marker}_objetivo` } },
    metodologia: { ...section(), respostas_usuario: { abordagem: `${marker}_metodologia` } },
    fundamentacao_teorica: section(), resultados: { ...section(), tipo: '' }, resumo_completo: '', numero_palavras: 0, limite_palavras: 250,
    avaliacao_final: { coerencia: '', clareza: '', coesao: '', adequacao_academica: '', problemas_identificados: [], sugestoes: [] },
  }
}

async function health(): Promise<void> {
  const response = await fetch(`${required('DARCY_E2E_API_BASE_URL')}/api/darcy/health`)
  const payload: unknown = await response.json()
  assert(response.status === 200, 'Health check E2E falhou.')
  assertResumoHistoryE2EBackendIdentity(payload)
  assert(process.env.DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER === 'fake', 'Provider fake não está ativo.')
}

export async function runScientificDiagnosisPersistenceE2E() {
  await health()
  const userA = await authenticate('A')
  const userB = await authenticate('B')
  const creation = await request('/api/projects', userA.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: marker, field: 'Teste sintético F01', type: 'resumo-academico' }) })
  const project = record(creation.body) && record(creation.body.project) ? creation.body.project : undefined
  const projectId = typeof project?.id === 'string' ? project.id : undefined
  assert(creation.status === 201 && projectId, `Criação sintética falhou (HTTP ${creation.status}).`)

  try {
    const progressPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}`
    const initial = await request(progressPath, userA.token)
    assert(initial.status === 200 && record(initial.body) && initial.body.revision === 0 && initial.body.progress === null, 'GET inicial não retornou revisão 0.')
    const draft = progress()
    const saved = await request(progressPath, userA.token, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: draft, expectedRevision: 0 }) })
    assert(saved.status === 200 && record(saved.body) && saved.body.revision === 1, 'PUT sintético não confirmou revisão 1.')

    const approved = structuredClone(draft)
    approved.contexto.status = 'aprovado'
    const approval = await request(`${progressPath}/sections/contexto/approve`, userA.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: approved, expectedRevision: 1 }) })
    assert(approval.status === 200 && record(approval.body) && approval.body.revision === 2, 'Aprovação sintética não confirmou revisão 2.')

    const diagnosisPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/scientific-diagnosis`
    const first = await request(diagnosisPath, userA.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2, scope: 'resumo' }) })
    assert(first.status === 200 && record(first.body) && record(first.body.data) && typeof first.body.data.diagnosisId === 'string' && first.body.data.analyzedRevision === 2 && typeof first.body.data.textVersionId === 'string', 'Diagnóstico não foi persistido com vínculo à versão analisada.')
    const diagnosisId = first.body.data.diagnosisId as string
    const repeated = await request(diagnosisPath, userA.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2, scope: 'resumo' }) })
    assert(repeated.status === 200 && record(repeated.body) && record(repeated.body.data) && repeated.body.data.diagnosisId === diagnosisId, 'Repetição criou diagnóstico duplicado.')

    const listPath = `/api/v1/modulos/resumo-academico/${encodeURIComponent(projectId)}/scientific-diagnoses?limit=10`
    const listed = await request(listPath, userA.token)
    assert(listed.status === 200 && record(listed.body) && record(listed.body.diagnoses) && Array.isArray(listed.body.diagnoses.diagnoses) && listed.body.diagnoses.diagnoses.length === 1, 'Consulta não retornou o diagnóstico persistido.')
    const loaded = await request(`${listPath.slice(0, listPath.indexOf('?'))}/${encodeURIComponent(diagnosisId)}`, userA.token)
    assert(loaded.status === 200 && record(loaded.body) && record(loaded.body.diagnosis) && loaded.body.diagnosis.id === diagnosisId, 'Consulta individual falhou.')
    const foreign = await request(listPath, userB.token)
    assert(foreign.status === 404, 'Ownership de diagnóstico não foi bloqueado.')

    const changed = structuredClone(approved); changed.tema = `${marker}_updated`
    const next = await request(progressPath, userA.token, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ progress: changed, expectedRevision: 2 }) })
    assert(next.status === 200 && record(next.body) && next.body.revision === 3, 'Atualização de revisão falhou.')
    const stale = await request(diagnosisPath, userA.token, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ expectedRevision: 2, scope: 'resumo' }) })
    assert(stale.status === 409, 'Diagnóstico com revisão obsoleta não retornou 409.')

    const deletion = await request(`/api/projects/${encodeURIComponent(projectId)}`, userA.token, { method: 'DELETE' })
    const verification = await request(`/api/projects/${encodeURIComponent(projectId)}`, userA.token)
    assert(deletion.status === 204 && verification.status === 404, 'Cleanup sintético falhou.')
    return { projectId, firstStatus: first.status, repeatedStatus: repeated.status, listStatus: listed.status, ownershipStatus: foreign.status, staleStatus: stale.status, cleanup: { deletionStatus: deletion.status, verificationStatus: verification.status } }
  } catch (error) {
    try { await request(`/api/projects/${encodeURIComponent(projectId)}`, userA.token, { method: 'DELETE' }) } catch { /* evidência principal preservada */ }
    throw error
  }
}

if (require.main === module) {
  runScientificDiagnosisPersistenceE2E()
    .then((result) => console.log(JSON.stringify({ result: 'approved', ...result })))
    .catch((error: unknown) => { console.error(`[DARCY E2E diagnóstico] ${error instanceof Error ? error.message : 'Falha no cenário.'}`); process.exitCode = 1 })
}
