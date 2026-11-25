import { Prisma, ProjectType, ResumoAcademicoEventType, ResumoAcademicoTextOrigin } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { ScientificDiagnosisSchema, type ScientificDiagnosis } from '../schemas/scientificDiagnosis.schema'
import { ResumoAcademicoStateSchema } from '../schemas/resumoAcademico.schema'

const DiagnosisScopeSchema = z.literal('resumo')
const MAX_LIST_LIMIT = 50
const MAX_ATTEMPTS = 3

export interface PersistedScientificDiagnosis {
  id: string
  projectId: string
  profileId: string
  scope: 'resumo'
  analyzedRevision: number
  textVersionId: string | null
  diagnosis: ScientificDiagnosis
  createdAt: Date
}

export interface ScientificDiagnosisPage {
  diagnoses: PersistedScientificDiagnosis[]
  nextCursor: string | null
}

export class ScientificDiagnosisRevisionConflictError extends Error {
  constructor(public readonly revision: number) {
    super('A revisão analisada deixou de ser a revisão atual do projeto.')
    this.name = 'ScientificDiagnosisRevisionConflictError'
  }
}

type DiagnosisDatabase = Pick<Prisma.TransactionClient, 'project' | 'resumoAcademicoProgress' | 'resumoAcademicoScientificDiagnosis' | 'resumoAcademicoTextVersion'>

const diagnosisSelect = {
  id: true,
  projectId: true,
  profileId: true,
  scope: true,
  analyzedRevision: true,
  diagnosis: true,
  textVersionId: true,
  createdAt: true,
} satisfies Prisma.ResumoAcademicoScientificDiagnosisSelect

type SelectedDiagnosis = Prisma.ResumoAcademicoScientificDiagnosisGetPayload<{ select: typeof diagnosisSelect }>

function isRetryable(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error &&
    ((error as { code?: unknown }).code === 'P2034' || (error as { code?: unknown }).code === 'P2002'))
}

function toRecord(row: SelectedDiagnosis): PersistedScientificDiagnosis {
  const diagnosis = ScientificDiagnosisSchema.parse(row.diagnosis)
  return {
    id: row.id,
    projectId: row.projectId,
    profileId: row.profileId,
    scope: DiagnosisScopeSchema.parse(row.scope),
    analyzedRevision: row.analyzedRevision,
    // Vínculos antigos, criados apenas pela coincidência de revisão, não são prova de aprovação.
    textVersionId: diagnosis.reviewState === 'formal_milestone' ? row.textVersionId : null,
    diagnosis,
    createdAt: row.createdAt,
  }
}

async function ownedProject(database: DiagnosisDatabase, projectId: string, profileId: string): Promise<{ id: string } | null> {
  return database.project.findFirst({
    where: { id: projectId, profileId, type: ProjectType.resumo_academico },
    select: { id: true },
  })
}

async function saveInTransaction(
  database: DiagnosisDatabase,
  projectId: string,
  profileId: string,
  diagnosis: ScientificDiagnosis,
): Promise<PersistedScientificDiagnosis | undefined> {
  const project = await ownedProject(database, projectId, profileId)
  if (!project) return undefined

  const progress = await database.resumoAcademicoProgress.findUnique({
    where: { projectId: project.id },
    select: { revision: true, progress: true },
  })
  const currentRevision = progress?.revision ?? 0
  if (currentRevision !== diagnosis.analyzedRevision) throw new ScientificDiagnosisRevisionConflictError(currentRevision)

  const existing = await database.resumoAcademicoScientificDiagnosis.findUnique({
    where: { projectId_analyzedRevision_scope: { projectId: project.id, analyzedRevision: diagnosis.analyzedRevision, scope: 'resumo' } },
    select: diagnosisSelect,
  })
  if (existing) {
    const recorded = toRecord(existing)
    if (diagnosis.analyzedContentHash && recorded.diagnosis.analyzedContentHash &&
      diagnosis.analyzedContentHash !== recorded.diagnosis.analyzedContentHash) {
      throw new ScientificDiagnosisRevisionConflictError(currentRevision)
    }
    return recorded
  }

  const parsedProgress = ResumoAcademicoStateSchema.safeParse(progress?.progress)
  const candidates = parsedProgress.success ? await database.resumoAcademicoTextVersion.findMany({
    where: {
      projectId: project.id,
      progressRevision: diagnosis.analyzedRevision,
      origin: ResumoAcademicoTextOrigin.pesquisador,
      sourceEventId: { not: null },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true, scopeKey: true, section: true, content: true, sourceEventId: true,
      sourceEvent: { select: { projectId: true, type: true, section: true, contentVersionRef: true } },
    },
  }) : []
  const textVersion = candidates.find((version) => {
    const event = version.sourceEvent
    if (!event || !version.sourceEventId || event.projectId !== project.id || event.contentVersionRef !== version.id) return false
    if (version.scopeKey === 'resumo_completo') {
      return version.section === null && event.type === ResumoAcademicoEventType.resumo_consolidado &&
        event.section === null && Boolean(parsedProgress.data?.resumo_completo.trim()) &&
        version.content === parsedProgress.data?.resumo_completo
    }
    const section = version.section
    return section !== null && (section === 'contexto' || section === 'objetivo' || section === 'metodologia') &&
      version.scopeKey === `secao.${section}` &&
      event.type === ResumoAcademicoEventType.secao_aprovada && event.section === section &&
      parsedProgress.data?.[section].status === 'aprovado' &&
      Boolean(parsedProgress.data?.[section].texto_sugerido.trim()) &&
      version.content === parsedProgress.data?.[section].texto_sugerido
  })

  const recordedDiagnosis = ScientificDiagnosisSchema.parse({
    ...diagnosis,
    reviewState: textVersion ? 'formal_milestone' : 'working_draft',
    associatedVersionScope: textVersion?.scopeKey ?? null,
  })

  const created = await database.resumoAcademicoScientificDiagnosis.create({
    data: {
      projectId: project.id,
      profileId,
      scope: 'resumo',
      analyzedRevision: diagnosis.analyzedRevision,
      diagnosis: recordedDiagnosis as unknown as Prisma.InputJsonValue,
      textVersionId: textVersion?.id ?? null,
    },
    select: diagnosisSelect,
  })
  return toRecord(created)
}

export async function persistScientificDiagnosis(
  projectId: string,
  profileId: string,
  diagnosis: ScientificDiagnosis,
): Promise<PersistedScientificDiagnosis | undefined> {
  ScientificDiagnosisSchema.parse(diagnosis)
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction((transaction) => saveInTransaction(transaction, projectId, profileId, diagnosis), {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!isRetryable(error) || attempt === MAX_ATTEMPTS - 1) throw error
    }
  }
  throw new Error('A persistência do diagnóstico excedeu as tentativas permitidas.')
}

async function withOwnedProject<T>(projectId: string, profileId: string, operation: (database: DiagnosisDatabase, projectId: string) => Promise<T>): Promise<T | undefined> {
  return prisma.$transaction(async (transaction) => {
    const project = await ownedProject(transaction, projectId, profileId)
    if (!project) return undefined
    return operation(transaction, project.id)
  })
}

export async function listOwnedScientificDiagnoses(
  projectId: string,
  profileId: string,
  options: { limit?: number; beforeCreatedAt?: string } = {},
): Promise<ScientificDiagnosisPage | undefined> {
  const limit = z.number().int().min(1).max(MAX_LIST_LIMIT).default(25).parse(options.limit)
  const beforeCreatedAt = options.beforeCreatedAt === undefined
    ? undefined
    : z.string().datetime({ offset: true }).parse(options.beforeCreatedAt)
  return withOwnedProject(projectId, profileId, async (database, ownedProjectId) => {
    const rows = await database.resumoAcademicoScientificDiagnosis.findMany({
      where: {
        projectId: ownedProjectId,
        ...(beforeCreatedAt ? { createdAt: { lt: new Date(beforeCreatedAt) } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: diagnosisSelect,
    })
    const page = rows.slice(0, limit).map(toRecord)
    return { diagnoses: page, nextCursor: rows.length > limit ? page.at(-1)?.createdAt.toISOString() ?? null : null }
  })
}

export async function getOwnedScientificDiagnosis(
  projectId: string,
  profileId: string,
  diagnosisId: string,
): Promise<PersistedScientificDiagnosis | undefined> {
  return withOwnedProject(projectId, profileId, async (database, ownedProjectId) => {
    const row = await database.resumoAcademicoScientificDiagnosis.findFirst({
      where: { id: diagnosisId, projectId: ownedProjectId },
      select: diagnosisSelect,
    })
    return row ? toRecord(row) : undefined
  })
}
