import { ProjectType, type Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import {
  ResumoAcademicoStateSchema,
  type ResumoAcademicoState,
} from '../schemas/resumoAcademico.schema'

function parsePersistedProgress(progress: Prisma.JsonValue): ResumoAcademicoState {
  const parseResult = ResumoAcademicoStateSchema.safeParse(progress)

  if (!parseResult.success) {
    throw new Error('O progresso persistido possui formato inválido.')
  }

  return parseResult.data
}

async function findOwnedResumoAcademicoProject(projectId: string, profileId: string) {
  return prisma.project.findFirst({
    where: {
      id: projectId,
      profileId,
      type: ProjectType.resumo_academico,
    },
    select: { id: true },
  })
}

export async function getResumoAcademicoProgress(
  projectId: string,
  profileId: string,
): Promise<ResumoAcademicoState | null | undefined> {
  const project = await findOwnedResumoAcademicoProject(projectId, profileId)

  if (!project) return undefined

  const progress = await prisma.resumoAcademicoProgress.findUnique({
    where: { projectId: project.id },
    select: { progress: true },
  })

  return progress ? parsePersistedProgress(progress.progress) : null
}

/**
 * Recupera somente a decisão contextual que pertence ao Project do usuário autenticado.
 * `undefined` indica Project inexistente, não pertencente ao usuário ou de outro módulo.
 */
export async function getOwnedResumoAutoralDecisionContext(
  projectId: string,
  profileId: string,
): Promise<string | null | undefined> {
  const progress = await getResumoAcademicoProgress(projectId, profileId)

  if (progress === undefined || progress === null) return progress

  const decisao = progress.decisoes_autorais?.find(
    (item) => item.id === 'contexto_problema_central',
  )

  if (!decisao) return null

  return `Problema central escolhido pelo pesquisador: ${decisao.escolha}\nJustificativa informada pelo pesquisador: ${decisao.justificativa}`
}

export async function upsertResumoAcademicoProgress(
  projectId: string,
  profileId: string,
  progress: ResumoAcademicoState,
): Promise<ResumoAcademicoState | undefined> {
  const project = await findOwnedResumoAcademicoProject(projectId, profileId)

  if (!project) return undefined

  const persistedProgress = await prisma.resumoAcademicoProgress.upsert({
    where: { projectId: project.id },
    create: {
      projectId: project.id,
      progress,
    },
    update: { progress },
    select: { progress: true },
  })

  return parsePersistedProgress(persistedProgress.progress)
}
