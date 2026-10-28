import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import {
  Prisma,
  ResumoAcademicoEventActor,
  ResumoAcademicoEventType,
  ResumoAcademicoSection,
} from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  createResumoAcademicoTextVersion,
  createResumoAcademicoTextVersionInTransaction,
  getOwnedResumoAcademicoTextVersion,
  listOwnedResumoAcademicoTextVersions,
} from '../services/ResumoAcademicoTextVersionService'
import { assertResumoHistoryE2EBackendIdentity } from '../config/resumoHistoryE2eEnvironment'

interface ApiResponse {
  status: number
  body: unknown
}

interface AuthenticatedUser {
  token: string
  userId: string
}

export interface ResumoTextVersionsE2EReport {
  sequentialVersionNumbers: number[]
  concurrentVersionNumbers: number[]
  duplicateVersionNumber: number
  ownershipBlocked: boolean
  nonResumoProjectBlocked: boolean
  atomicRollbackConfirmed: boolean
  cleanup: Array<{ projectId: string; status: number; verificationStatus: number }>
}

const SYNTHETIC_MARKER = `E2E_TEXT_VERSION_${randomUUID()}`

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
  try { body = await response.json() as unknown } catch { /* o status ainda é verificável */ }
  return { status: response.status, body }
}

async function authenticateE2EUser(user: 'A' | 'B'): Promise<AuthenticatedUser> {
  const client = createClient(
    requireEnvironmentValue('SUPABASE_URL'),
    requireEnvironmentValue('SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { data, error } = await client.auth.signInWithPassword({
    email: requireEnvironmentValue(`DARCY_E2E_USER_${user}_EMAIL`),
    password: requireEnvironmentValue(`DARCY_E2E_USER_${user}_PASSWORD`),
  })
  if (error || !data.session?.access_token || !data.user?.id) {
    throw new Error(`Não foi possível autenticar a conta E2E ${user}.`)
  }
  return { token: data.session.access_token, userId: data.user.id }
}

async function assertBackendIdentity(): Promise<void> {
  const response = await fetch(`${requireEnvironmentValue('DARCY_E2E_API_BASE_URL')}/api/darcy/health`)
  let payload: unknown
  try { payload = await response.json() as unknown } catch { /* validador abaixo falha sem expor corpo */ }
  assertCondition(response.status === 200, 'O backend E2E não respondeu ao health check.')
  assertResumoHistoryE2EBackendIdentity(payload)
}

async function createProject(user: AuthenticatedUser, type: 'resumo-academico' | 'artigo'): Promise<string> {
  const response = await requestApi('/api/projects', user.token, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      title: `${SYNTHETIC_MARKER} ${type}`,
      field: 'Teste sintético isolado de versões textuais',
      type,
    }),
  })
  const project = isRecord(response.body) && isRecord(response.body.project)
    ? response.body.project
    : undefined
  const projectId = typeof project?.id === 'string' ? project.id : undefined
  assertCondition(response.status === 201 && projectId, `Criação sintética falhou (HTTP ${response.status}).`)
  return projectId
}

async function cleanupProject(projectId: string, token: string): Promise<{
  projectId: string
  status: number
  verificationStatus: number
}> {
  const deletion = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token, { method: 'DELETE' })
  const verification = await requestApi(`/api/projects/${encodeURIComponent(projectId)}`, token)
  if (deletion.status !== 204 || verification.status !== 404) {
    throw new Error(`Limpeza sintética incompleta. Identificador remanescente: ${projectId}`)
  }
  return { projectId, status: deletion.status, verificationStatus: verification.status }
}

function versionInput(
  projectId: string,
  profileId: string,
  content: string,
  progressRevision: number,
  overrides: Partial<{
    scopeKey: string
    section: ResumoAcademicoSection | null
    operation: 'ai_generation' | 'researcher_confirmation' | 'restoration'
    sourceEventId: string
    previousVersionId: string
  }> = {},
) {
  return {
    projectId,
    profileId,
    scopeKey: overrides.scopeKey ?? 'contexto',
    section: overrides.section ?? ResumoAcademicoSection.contexto,
    progressRevision,
    content,
    operation: overrides.operation ?? 'researcher_confirmation' as const,
    ...(overrides.sourceEventId ? { sourceEventId: overrides.sourceEventId } : {}),
    ...(overrides.previousVersionId ? { previousVersionId: overrides.previousVersionId } : {}),
  }
}

async function createSourceEvent(projectId: string, sequence: number): Promise<string> {
  const event = await prisma.resumoAcademicoHistoryEvent.create({
    data: {
      projectId,
      sequence,
      type: ResumoAcademicoEventType.rascunho_gerado,
      actor: ResumoAcademicoEventActor.pesquisador,
      section: ResumoAcademicoSection.contexto,
      summary: 'Evento sintético de teste de versão textual.',
    },
    select: { id: true },
  })
  return event.id
}

export async function runResumoAcademicoTextVersionsE2E(): Promise<ResumoTextVersionsE2EReport> {
  await assertBackendIdentity()
  const userA = await authenticateE2EUser('A')
  const userB = await authenticateE2EUser('B')
  const createdProjectIds: Array<{ id: string; token: string }> = []
  const cleanup: ResumoTextVersionsE2EReport['cleanup'] = []

  try {
    const resumoProjectId = await createProject(userA, 'resumo-academico')
    createdProjectIds.push({ id: resumoProjectId, token: userA.token })

    const first = await createResumoAcademicoTextVersion(
      versionInput(resumoProjectId, userA.userId, `${SYNTHETIC_MARKER}_ONE`, 1),
    )
    assertCondition(first?.versionNumber === 1, 'A primeira versão não recebeu numeração 1.')

    const second = await createResumoAcademicoTextVersion(
      versionInput(resumoProjectId, userA.userId, `${SYNTHETIC_MARKER}_TWO`, 2, {
        previousVersionId: first.id,
      }),
    )
    assertCondition(second?.versionNumber === 2 && second.previousVersionId === first.id, 'A linhagem sequencial é inválida.')

    const duplicate = await createResumoAcademicoTextVersion(
      versionInput(resumoProjectId, userA.userId, `${SYNTHETIC_MARKER}_TWO`, 99, { operation: 'ai_generation' }),
    )
    assertCondition(duplicate?.id === second.id, 'A deduplicação por hash criou uma versão adicional.')

    const eventId = await createSourceEvent(resumoProjectId, 100)
    const idempotentInput = versionInput(
      resumoProjectId,
      userA.userId,
      `${SYNTHETIC_MARKER}_THREE`,
      3,
      { sourceEventId: eventId },
    )
    const third = await createResumoAcademicoTextVersion(idempotentInput)
    const repeatedThird = await createResumoAcademicoTextVersion(idempotentInput)
    assertCondition(third?.id === repeatedThird?.id && third?.sourceEventId === eventId, 'A idempotência por evento falhou.')

    const [concurrentA, concurrentB] = await Promise.all([
      createResumoAcademicoTextVersion(versionInput(resumoProjectId, userA.userId, `${SYNTHETIC_MARKER}_CONCURRENT_A`, 4)),
      createResumoAcademicoTextVersion(versionInput(resumoProjectId, userA.userId, `${SYNTHETIC_MARKER}_CONCURRENT_B`, 4)),
    ])
    const concurrentVersionNumbers = [concurrentA?.versionNumber ?? -1, concurrentB?.versionNumber ?? -1].sort((a, b) => a - b)
    assertCondition(
      concurrentVersionNumbers[0] > 0 && concurrentVersionNumbers[0] !== concurrentVersionNumbers[1],
      'As criações concorrentes não receberam números distintos.',
    )

    const page = await listOwnedResumoAcademicoTextVersions(resumoProjectId, userA.userId, {
      scopeKey: 'contexto',
      limit: 100,
    })
    assertCondition(page?.versions.length === 5, 'A consulta não retornou a quantidade esperada de versões distintas.')
    assertCondition(page.versions.every((item) => item.projectId === resumoProjectId), 'A consulta retornou versão de outro projeto.')

    const loaded = await getOwnedResumoAcademicoTextVersion(resumoProjectId, userA.userId, first.id)
    assertCondition(loaded?.content === first.content && loaded.contentHash === first.contentHash, 'A versão persistida foi alterada.')

    const foreignRead = await getOwnedResumoAcademicoTextVersion(resumoProjectId, userB.userId, first.id)
    const foreignList = await listOwnedResumoAcademicoTextVersions(resumoProjectId, userB.userId, { scopeKey: 'contexto' })
    const foreignCreate = await createResumoAcademicoTextVersion(
      versionInput(resumoProjectId, userB.userId, `${SYNTHETIC_MARKER}_FOREIGN`, 1),
    )
    assertCondition(foreignRead === undefined && foreignList === undefined && foreignCreate === undefined, 'Ownership entre contas não foi bloqueado.')

    const articleProjectId = await createProject(userA, 'artigo')
    createdProjectIds.push({ id: articleProjectId, token: userA.token })
    const nonResumoCreate = await createResumoAcademicoTextVersion(
      versionInput(articleProjectId, userA.userId, `${SYNTHETIC_MARKER}_WRONG_TYPE`, 1),
    )
    assertCondition(nonResumoCreate === undefined, 'O serviço aceitou projeto que não é resumo_academico.')

    const oversizedContent = 'x'.repeat(200_001)
    let oversizedEventId: string | undefined
    let atomicFailureObserved = false
    try {
      await prisma.$transaction(async (transaction) => {
        const sourceEvent = await transaction.resumoAcademicoHistoryEvent.create({
          data: {
            projectId: resumoProjectId,
            sequence: 101,
            type: ResumoAcademicoEventType.rascunho_gerado,
            actor: ResumoAcademicoEventActor.pesquisador,
            section: ResumoAcademicoSection.contexto,
            summary: 'Evento de origem que deve sofrer rollback.',
          },
          select: { id: true },
        })
        oversizedEventId = sourceEvent.id
        await transaction.resumoAcademicoHistoryEvent.create({
          data: {
            projectId: resumoProjectId,
            sequence: 102,
            type: ResumoAcademicoEventType.rascunho_gerado,
            actor: ResumoAcademicoEventActor.pesquisador,
            section: ResumoAcademicoSection.contexto,
            summary: 'Evento que deve sofrer rollback.',
          },
          select: { id: true },
        })
        await createResumoAcademicoTextVersionInTransaction(transaction, versionInput(
          resumoProjectId,
          userA.userId,
          oversizedContent,
          6,
          { sourceEventId: sourceEvent.id },
        ))
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch {
      atomicFailureObserved = true
    }
    const rolledBackEvent = await prisma.resumoAcademicoHistoryEvent.findFirst({
      where: { id: oversizedEventId ?? 'missing-synthetic-event' },
      select: { id: true },
    })
    assertCondition(atomicFailureObserved && rolledBackEvent === null, 'A falha de versão não reverteu a transação.')

    for (const project of createdProjectIds) cleanup.push(await cleanupProject(project.id, project.token))

    return {
      sequentialVersionNumbers: [first.versionNumber, second.versionNumber, third?.versionNumber ?? -1],
      concurrentVersionNumbers,
      duplicateVersionNumber: duplicate?.versionNumber ?? -1,
      ownershipBlocked: foreignRead === undefined && foreignList === undefined && foreignCreate === undefined,
      nonResumoProjectBlocked: nonResumoCreate === undefined,
      atomicRollbackConfirmed: atomicFailureObserved && rolledBackEvent === null,
      cleanup,
    }
  } catch (error) {
    const cleanupFailures: string[] = []
    for (const project of createdProjectIds) {
      try {
        cleanup.push(await cleanupProject(project.id, project.token))
      } catch {
        cleanupFailures.push(project.id)
      }
    }
    if (cleanupFailures.length > 0) {
      throw new Error(`Falha no cenário e limpeza pendente para projetos sintéticos: ${cleanupFailures.join(', ')}`)
    }
    throw error
  }
}

if (require.main === module) {
  runResumoAcademicoTextVersionsE2E()
    .then((report) => console.log(JSON.stringify({ result: 'approved', ...report })))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Falha no teste E2E de versões textuais.'
      console.error(`[DARCY E2E versões textuais] ${message}`)
      process.exitCode = 1
    })
}
