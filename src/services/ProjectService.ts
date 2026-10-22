/**
 * Projeto: DARCY — Sistema Inteligente de Orientação Científica
 *
 * Autor: Caike Carvalho Rabis
 *
 * Titular dos direitos patrimoniais: Escrita com Ciência
 *
 * Copyright (c) 2026 Escrita com Ciência.
 *
 * Todos os direitos reservados.
 *
 * Consulte NOTICE.txt para informações de titularidade.
 */


import { ProjectType as PrismaProjectType, type Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { ProjectType } from '../types/darcy.types'
import {
  derivePersistedResumoProjectMeta,
  type ResumoProjectMeta,
} from './ResumoProjectMetaService'

export interface CreateProjectInput {
  title: string
  field: string
  type: ProjectType
}

export interface UpdateProjectInput {
  title?: string
  field?: string
  type?: ProjectType
}

export interface ProjectResponse {
  id: string
  title: string
  /** Título contextual seguro para exibição em Projects de Resumo Acadêmico. */
  displayTitle?: string
  resumoMeta?: ResumoProjectMeta
  field: string
  type: ProjectType
  createdAt: Date
  updatedAt: Date
}

const API_TO_PRISMA_PROJECT_TYPE: Record<ProjectType, PrismaProjectType> = {
  artigo: PrismaProjectType.artigo,
  dissertacao: PrismaProjectType.dissertacao,
  tese: PrismaProjectType.tese,
  tcc: PrismaProjectType.tcc,
  'projeto-pesquisa': PrismaProjectType.projeto_pesquisa,
  'resumo-academico': PrismaProjectType.resumo_academico,
}

const PRISMA_TO_API_PROJECT_TYPE: Record<PrismaProjectType, ProjectType> = {
  [PrismaProjectType.artigo]: 'artigo',
  [PrismaProjectType.dissertacao]: 'dissertacao',
  [PrismaProjectType.tese]: 'tese',
  [PrismaProjectType.tcc]: 'tcc',
  [PrismaProjectType.projeto_pesquisa]: 'projeto-pesquisa',
  [PrismaProjectType.resumo_academico]: 'resumo-academico',
}

const projectSelect = {
  id: true,
  title: true,
  field: true,
  type: true,
  createdAt: true,
  updatedAt: true,
  resumoAcademicoProgress: {
    select: {
      progress: true,
    },
  },
} satisfies Prisma.ProjectSelect

type StoredProject = Prisma.ProjectGetPayload<{ select: typeof projectSelect }>

function getResumoDisplayTitle(progress: Prisma.JsonValue | null): string | undefined {
  if (!progress || typeof progress !== 'object' || Array.isArray(progress)) return undefined

  const tema = progress.tema
  return typeof tema === 'string' && tema.trim() ? tema.trim() : undefined
}

function toProjectResponse(project: StoredProject): ProjectResponse {
  const { resumoAcademicoProgress, ...projectData } = project

  return {
    ...projectData,
    type: PRISMA_TO_API_PROJECT_TYPE[project.type],
    ...(project.type === PrismaProjectType.resumo_academico && {
      displayTitle: getResumoDisplayTitle(resumoAcademicoProgress?.progress ?? null),
      resumoMeta: derivePersistedResumoProjectMeta(resumoAcademicoProgress?.progress),
    }),
  }
}

function toPrismaUpdateData(input: UpdateProjectInput): Prisma.ProjectUpdateManyMutationInput {
  const data: Prisma.ProjectUpdateManyMutationInput = {}

  if (input.title !== undefined) data.title = input.title
  if (input.field !== undefined) data.field = input.field
  if (input.type !== undefined) data.type = API_TO_PRISMA_PROJECT_TYPE[input.type]

  return data
}

export async function createProject(
  profileId: string,
  input: CreateProjectInput,
): Promise<ProjectResponse> {
  const project = await prisma.project.create({
    data: {
      profileId,
      title: input.title,
      field: input.field,
      type: API_TO_PRISMA_PROJECT_TYPE[input.type],
    },
    select: projectSelect,
  })

  return toProjectResponse(project)
}

export async function listProjectsByOwner(profileId: string): Promise<ProjectResponse[]> {
  const projects = await prisma.project.findMany({
    where: { profileId },
    select: projectSelect,
    orderBy: { updatedAt: 'desc' },
  })

  return projects.map(toProjectResponse)
}

export async function findProjectByIdAndOwner(
  projectId: string,
  profileId: string,
): Promise<ProjectResponse | null> {
  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      profileId,
    },
    select: projectSelect,
  })

  return project ? toProjectResponse(project) : null
}

export async function updateOwnedProject(
  projectId: string,
  profileId: string,
  input: UpdateProjectInput,
): Promise<ProjectResponse | null> {
  return prisma.$transaction(async (transaction) => {
    const { count } = await transaction.project.updateMany({
      where: {
        id: projectId,
        profileId,
      },
      data: toPrismaUpdateData(input),
    })

    if (count === 0) return null

    const project = await transaction.project.findFirst({
      where: {
        id: projectId,
        profileId,
      },
      select: projectSelect,
    })

    return project ? toProjectResponse(project) : null
  })
}

export async function deleteOwnedProject(projectId: string, profileId: string): Promise<boolean> {
  const { count } = await prisma.project.deleteMany({
    where: {
      id: projectId,
      profileId,
    },
  })

  return count > 0
}
