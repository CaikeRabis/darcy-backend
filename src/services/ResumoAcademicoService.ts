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


import {
  ProjectType,
  ResumoAcademicoEventActor,
  ResumoAcademicoEventType,
  ResumoAcademicoSection,
  Prisma,
} from '@prisma/client'
import { isDeepStrictEqual } from 'node:util'
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

type ResumoDatabaseClient = Pick<
  Prisma.TransactionClient,
  'project' | 'resumoAcademicoProgress' | 'resumoAcademicoHistoryEvent'
>

const RESUMO_SECTIONS = [
  'contexto',
  'objetivo',
  'metodologia',
  'fundamentacao_teorica',
  'resultados',
] as const satisfies readonly ResumoAcademicoSection[]

const SECTION_LABELS: Record<ResumoAcademicoSection, string> = {
  contexto: 'Contexto',
  objetivo: 'Objetivo',
  metodologia: 'Metodologia',
  fundamentacao_teorica: 'Fundamentação teórica',
  resultados: 'Resultados',
}

const HISTORY_EVENT_ORDER: Record<ResumoAcademicoEventType, number> = {
  rascunho_gerado: 1,
  rascunho_regenerado: 2,
  secao_aprovada: 3,
  decisao_autoral_alterada: 4,
  classificacao_cientifica_alterada: 5,
  resumo_consolidado: 6,
}

const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3

interface HistoryEventCandidate {
  type: ResumoAcademicoEventType
  actor: ResumoAcademicoEventActor
  section?: ResumoAcademicoSection
  summary: string
}

export interface ResumoAcademicoHistoryEvent {
  id: string
  projectId: string
  sequence: number
  type: ResumoAcademicoEventType
  actor: ResumoAcademicoEventActor
  section: ResumoAcademicoSection | null
  summary: string
  contentVersionRef: string | null
  createdAt: Date
}

export interface ResumoAcademicoHistoryPage {
  events: ResumoAcademicoHistoryEvent[]
  nextCursor: number | null
}

export interface ResumoAcademicoProgressSnapshot {
  progress: ResumoAcademicoState | null
  revision: number
}

export type ResumoAcademicoProgressSaveResult =
  | { status: 'saved'; progress: ResumoAcademicoState; revision: number }
  | { status: 'conflict' }

async function findOwnedResumoAcademicoProject(
  database: ResumoDatabaseClient,
  projectId: string,
  profileId: string,
) {
  return database.project.findFirst({
    where: {
      id: projectId,
      profileId,
      type: ProjectType.resumo_academico,
    },
    select: { id: true },
  })
}

function sectionIndex(section: ResumoAcademicoSection | undefined): number {
  return section ? RESUMO_SECTIONS.indexOf(section) : RESUMO_SECTIONS.length
}

function authorialDecisionSignature(documento: ResumoAcademicoState | null): string | null {
  if (!documento) return null
  const decisao = documento.decisoes_autorais?.find((item) => item.id === 'contexto_problema_central')
  return decisao ? `${decisao.id}\u0000${decisao.escolha}\u0000${decisao.justificativa}` : null
}

function classificationSignature(documento: ResumoAcademicoState | null): string | null {
  if (!documento) return null
  const classificacao = documento.classificacao_cnpq
  if (!classificacao) return null

  const normalizeItem = (item: typeof classificacao.primaria) => ({
    codigo: item.codigo,
    nivel: item.nivel,
    nome: item.nome,
    caminhoCodigos: item.caminho_codigos,
  })

  return JSON.stringify({
    versao: classificacao.versao_catalogo,
    primaria: normalizeItem(classificacao.primaria),
    correlatas: [...(classificacao.correlatas ?? [])]
      .sort((left, right) => left.codigo.localeCompare(right.codigo))
      .map(normalizeItem),
    observacao: classificacao.observacao_interdisciplinar ?? null,
  })
}

/**
 * Deriva somente acontecimentos de domínio comprováveis pelo estado anterior
 * e pelo novo estado validado. O ator é o pesquisador autenticado que iniciou
 * o PUT; o produto ainda não orquestra a geração de rascunhos no backend e,
 * por isso, não atribui autoria literária ao DARCY nesta etapa.
 */
export function deriveResumoAcademicoHistoryEvents(
  previous: ResumoAcademicoState | null,
  next: ResumoAcademicoState,
): HistoryEventCandidate[] {
  const events: HistoryEventCandidate[] = []

  for (const section of RESUMO_SECTIONS) {
    const previousSection = previous?.[section]
    const previousText = previousSection?.texto_sugerido.trim() ?? ''
    const nextText = next[section].texto_sugerido.trim()

    if (!previousText && nextText) {
      events.push({
        type: ResumoAcademicoEventType.rascunho_gerado,
        actor: ResumoAcademicoEventActor.pesquisador,
        section,
        summary: `Rascunho de ${SECTION_LABELS[section]} registrado para revisão.`,
      })
    } else if (previousText && nextText && previousText !== nextText) {
      events.push({
        type: ResumoAcademicoEventType.rascunho_regenerado,
        actor: ResumoAcademicoEventActor.pesquisador,
        section,
        summary: `Nova versão do rascunho de ${SECTION_LABELS[section]} registrada para revisão.`,
      })
    }

    if (previousSection?.status !== 'aprovado' && next[section].status === 'aprovado') {
      events.push({
        type: ResumoAcademicoEventType.secao_aprovada,
        actor: ResumoAcademicoEventActor.pesquisador,
        section,
        summary: `Seção ${SECTION_LABELS[section]} aprovada pelo pesquisador.`,
      })
    }
  }

  if (authorialDecisionSignature(previous) !== authorialDecisionSignature(next)) {
    events.push({
      type: ResumoAcademicoEventType.decisao_autoral_alterada,
      actor: ResumoAcademicoEventActor.pesquisador,
      summary: 'Decisão autoral contextual atualizada pelo pesquisador.',
    })
  }

  if (classificationSignature(previous) !== classificationSignature(next)) {
    events.push({
      type: ResumoAcademicoEventType.classificacao_cientifica_alterada,
      actor: ResumoAcademicoEventActor.pesquisador,
      summary: 'Classificação científica do projeto atualizada.',
    })
  }

  const previousSummary = previous?.resumo_completo.trim() ?? ''
  const nextSummary = next.resumo_completo.trim()
  if (!previousSummary && nextSummary) {
    events.push({
      type: ResumoAcademicoEventType.resumo_consolidado,
      actor: ResumoAcademicoEventActor.pesquisador,
      summary: 'Resumo acadêmico consolidado registrado.',
    })
  }

  return events.sort((left, right) => (
    HISTORY_EVENT_ORDER[left.type] - HISTORY_EVENT_ORDER[right.type] ||
    sectionIndex(left.section) - sectionIndex(right.section)
  ))
}

function isSerializableTransactionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error.code === 'P2034' || error.code === 'P2002')
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
  const project = await findOwnedResumoAcademicoProject(prisma, projectId, profileId)
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
): Promise<ResumoAcademicoProgressSnapshot | undefined> {
  const project = await findOwnedResumoAcademicoProject(prisma, projectId, profileId)

  if (!project) return undefined

  const progress = await prisma.resumoAcademicoProgress.findUnique({
    where: { projectId: project.id },
    select: { progress: true, revision: true },
  })

  return progress
    ? { progress: parsePersistedProgress(progress.progress), revision: progress.revision }
    : { progress: null, revision: 0 }
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

  if (progress === undefined || progress.progress === null) {
    return progress === undefined ? undefined : null
  }

  const decisao = progress.progress.decisoes_autorais?.find(
    (item) => item.id === 'contexto_problema_central',
  )

  if (!decisao) return null

  return `Problema central escolhido pelo pesquisador: ${decisao.escolha}\nJustificativa informada pelo pesquisador: ${decisao.justificativa}`
}

export async function upsertResumoAcademicoProgress(
  projectId: string,
  profileId: string,
  progress: ResumoAcademicoState,
  expectedRevision: number,
): Promise<ResumoAcademicoProgressSaveResult | undefined> {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const project = await findOwnedResumoAcademicoProject(transaction, projectId, profileId)
        if (!project) return undefined

        const existing = await transaction.resumoAcademicoProgress.findUnique({
          where: { projectId: project.id },
          select: { progress: true, revision: true },
        })

        if (!existing) {
          if (expectedRevision !== 0) return { status: 'conflict' as const }

          const persistedProgress = await transaction.resumoAcademicoProgress.create({
            data: { projectId: project.id, progress, revision: 1 },
            select: { progress: true, revision: true },
          })
          const eventCandidates = deriveResumoAcademicoHistoryEvents(null, progress)

          if (eventCandidates.length > 0) {
            const lastEvent = await transaction.resumoAcademicoHistoryEvent.findFirst({
              where: { projectId: project.id },
              orderBy: { sequence: 'desc' },
              select: { sequence: true },
            })

            for (const [index, event] of eventCandidates.entries()) {
              await transaction.resumoAcademicoHistoryEvent.create({
                data: {
                  projectId: project.id,
                  sequence: (lastEvent?.sequence ?? 0) + index + 1,
                  type: event.type,
                  actor: event.actor,
                  ...(event.section ? { section: event.section } : {}),
                  summary: event.summary,
                },
              })
            }
          }

          return {
            status: 'saved' as const,
            progress: parsePersistedProgress(persistedProgress.progress),
            revision: persistedProgress.revision,
          }
        }

        if (existing.revision !== expectedRevision) return { status: 'conflict' as const }

        const previous = parsePersistedProgress(existing.progress)
        if (isDeepStrictEqual(previous, progress)) {
          return { status: 'saved' as const, progress: previous, revision: existing.revision }
        }

        const updated = await transaction.resumoAcademicoProgress.updateMany({
          where: { projectId: project.id, revision: expectedRevision },
          data: { progress, revision: { increment: 1 } },
        })
        if (updated.count !== 1) return { status: 'conflict' as const }

        const eventCandidates = deriveResumoAcademicoHistoryEvents(previous, progress)
        const lastEvent = eventCandidates.length > 0
          ? await transaction.resumoAcademicoHistoryEvent.findFirst({
            where: { projectId: project.id },
            orderBy: { sequence: 'desc' },
            select: { sequence: true },
          })
          : null

        if (eventCandidates.length > 0) {
          for (const [index, event] of eventCandidates.entries()) {
            await transaction.resumoAcademicoHistoryEvent.create({
              data: {
                projectId: project.id,
                sequence: (lastEvent?.sequence ?? 0) + index + 1,
                type: event.type,
                actor: event.actor,
                ...(event.section ? { section: event.section } : {}),
                summary: event.summary,
              },
            })
          }
        }

        return { status: 'saved' as const, progress, revision: expectedRevision + 1 }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (!isSerializableTransactionError(error) || attempt === MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS - 1) {
        throw error
      }
    }
  }

  throw new Error('A persistência do progresso excedeu as tentativas de serialização.')
}

/**
 * A paginação usa a sequência exclusiva por projeto como cursor estável.
 * Eventos são expostos somente após a verificação de ownership do projeto.
 */
export async function listOwnedResumoAcademicoHistory(
  projectId: string,
  profileId: string,
  limit: number,
  beforeSequence?: number,
): Promise<ResumoAcademicoHistoryPage | undefined> {
  const project = await findOwnedResumoAcademicoProject(prisma, projectId, profileId)
  if (!project) return undefined

  const events = await prisma.resumoAcademicoHistoryEvent.findMany({
    where: {
      projectId: project.id,
      ...(beforeSequence === undefined ? {} : { sequence: { lt: beforeSequence } }),
    },
    orderBy: { sequence: 'desc' },
    take: limit + 1,
    select: {
      id: true,
      projectId: true,
      sequence: true,
      type: true,
      actor: true,
      section: true,
      summary: true,
      contentVersionRef: true,
      createdAt: true,
    },
  })

  const page = events.slice(0, limit)
  return {
    events: page,
    nextCursor: events.length > limit ? page.at(-1)?.sequence ?? null : null,
  }
}
