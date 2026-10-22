import { ProjectType, type Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import {
  ClassificacaoCnpqSchema,
  DecisaoAutoralSchema,
  ResumoAcademicoStateSchema,
  type ResumoAcademicoState,
} from '../schemas/resumoAcademico.schema'
import type { ScientificClassificationContext } from '../types/darcy.types'

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

function toScientificClassificationContext(
  classificacao: NonNullable<ResumoAcademicoState['classificacao_cnpq']>,
): ScientificClassificationContext {
  const toItem = (item: typeof classificacao.primaria) => ({
    codigo: item.codigo,
    nome: item.nome,
    nivel: item.nivel,
    caminhoCodigos: item.caminho_codigos,
  })

  return {
    versaoCatalogo: classificacao.versao_catalogo,
    primaria: toItem(classificacao.primaria),
    correlatas: classificacao.correlatas?.map(toItem) ?? [],
    ...(classificacao.observacao_interdisciplinar
      ? { observacaoInterdisciplinar: classificacao.observacao_interdisciplinar }
      : {}),
  }
}

function getPersistedClassificationContext(progress: Prisma.JsonValue): ScientificClassificationContext | null {
  if (typeof progress !== 'object' || progress === null || Array.isArray(progress)) return null

  const parsed = ClassificacaoCnpqSchema.safeParse(progress.classificacao_cnpq)
  return parsed.success ? toScientificClassificationContext(parsed.data) : null
}

function getPersistedAutoralDecisionContext(progress: Prisma.JsonValue): string | null {
  const parsed = z.object({
    decisoes_autorais: z.array(DecisaoAutoralSchema).max(1).optional(),
  }).passthrough().safeParse(progress)
  const decisao = parsed.success
    ? parsed.data.decisoes_autorais?.find((item) => item.id === 'contexto_problema_central')
    : undefined

  return decisao
    ? `Problema central escolhido pelo pesquisador: ${decisao.escolha}\nJustificativa informada pelo pesquisador: ${decisao.justificativa}`
    : null
}

export interface OwnedResumoScientificContext {
  decisaoAutoralContextual: string | null
  classificacaoCnpqContextual: ScientificClassificationContext | null
}

/**
 * Recupera somente dados científicos persistidos no projeto autenticado.
 * Uma classificação ausente, legada ou inválida resulta em contexto não confirmado,
 * sem inferência substituta a partir de dados enviados pelo cliente.
 */
export async function getOwnedResumoScientificContext(
  projectId: string,
  profileId: string,
): Promise<OwnedResumoScientificContext | undefined> {
  const project = await findOwnedResumoAcademicoProject(projectId, profileId)
  if (!project) return undefined

  const persisted = await prisma.resumoAcademicoProgress.findUnique({
    where: { projectId: project.id },
    select: { progress: true },
  })
  if (!persisted) {
    return { decisaoAutoralContextual: null, classificacaoCnpqContextual: null }
  }

  return {
    decisaoAutoralContextual: getPersistedAutoralDecisionContext(persisted.progress),
    classificacaoCnpqContextual: getPersistedClassificationContext(persisted.progress),
  }
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
