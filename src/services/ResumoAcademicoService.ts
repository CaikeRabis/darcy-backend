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
