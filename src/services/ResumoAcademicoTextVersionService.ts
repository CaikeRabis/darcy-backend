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
  Prisma,
  PrismaClient,
  ProjectType,
  ResumoAcademicoSection,
  ResumoAcademicoTextOrigin,
} from '@prisma/client'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { prisma } from '../lib/prisma'

export const RESUMO_TEXT_VERSION_MAX_CONTENT_LENGTH = 200_000
export const RESUMO_TEXT_VERSION_MAX_LIST_LIMIT = 100
const MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS = 3

/**
 * A operação é determinada pelo orquestrador de domínio do servidor. Não é
 * uma declaração de autoria intelectual e não deve ser exposta como campo
 * livre em endpoints públicos.
 */
export const ResumoAcademicoTextVersionOperationSchema = z.enum([
  'ai_generation',
  'researcher_confirmation',
  'restoration',
])

export type ResumoAcademicoTextVersionOperation = z.infer<
  typeof ResumoAcademicoTextVersionOperationSchema
>

const ScopeKeySchema = z.string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, 'scopeKey inválido.')

const ProgressRevisionSchema = z.number().int().nonnegative()

const CreateTextVersionInputSchema = z.object({
  projectId: z.string().min(1),
  profileId: z.string().min(1),
  scopeKey: ScopeKeySchema,
  section: z.nativeEnum(ResumoAcademicoSection).nullable().optional(),
  progressRevision: ProgressRevisionSchema,
  content: z.string().max(RESUMO_TEXT_VERSION_MAX_CONTENT_LENGTH),
  operation: ResumoAcademicoTextVersionOperationSchema,
  previousVersionId: z.string().min(1).nullable().optional(),
  sourceEventId: z.string().min(1).nullable().optional(),
})

export type CreateResumoAcademicoTextVersionInput = z.input<typeof CreateTextVersionInputSchema>

export interface ResumoAcademicoTextVersionRecord {
  id: string
  projectId: string
  scopeKey: string
  section: ResumoAcademicoSection | null
  versionNumber: number
  progressRevision: number
  origin: ResumoAcademicoTextOrigin
  content: string
  contentHash: string
  previousVersionId: string | null
  sourceEventId: string | null
  createdAt: Date
}

export interface ResumoAcademicoTextVersionPage {
  versions: ResumoAcademicoTextVersionRecord[]
  nextCursor: number | null
}

export interface ListResumoAcademicoTextVersionsOptions {
  scopeKey: string
  section?: ResumoAcademicoSection
  limit?: number
  beforeVersionNumber?: number
}

const textVersionSelect = {
  id: true,
  projectId: true,
  scopeKey: true,
  section: true,
  versionNumber: true,
  progressRevision: true,
  origin: true,
  content: true,
  contentHash: true,
  previousVersionId: true,
  sourceEventId: true,
  createdAt: true,
} satisfies Prisma.ResumoAcademicoTextVersionSelect

type SelectedTextVersion = Prisma.ResumoAcademicoTextVersionGetPayload<{
  select: typeof textVersionSelect
}>

type ResumoTextVersionDatabase = Pick<
  Prisma.TransactionClient,
  'project' | 'resumoAcademicoTextVersion' | 'resumoAcademicoHistoryEvent'
>

type TransactionRunner = Pick<PrismaClient, '$transaction'>

function parseCreateInput(input: CreateResumoAcademicoTextVersionInput): z.output<typeof CreateTextVersionInputSchema> {
  return CreateTextVersionInputSchema.parse(input)
}

function normalizeOperation(operation: ResumoAcademicoTextVersionOperation): ResumoAcademicoTextOrigin {
  const origins: Record<ResumoAcademicoTextVersionOperation, ResumoAcademicoTextOrigin> = {
    ai_generation: ResumoAcademicoTextOrigin.ia_assistida,
    researcher_confirmation: ResumoAcademicoTextOrigin.pesquisador,
    restoration: ResumoAcademicoTextOrigin.restauracao,
  }

  return origins[operation]
}

function contentHash(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function toRecord(version: SelectedTextVersion): ResumoAcademicoTextVersionRecord {
  return version
}

function isRetryableTransactionError(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    'code' in error && (error.code === 'P2034' || error.code === 'P2002')
}

function validateListOptions(options: ListResumoAcademicoTextVersionsOptions): Required<
  Pick<ListResumoAcademicoTextVersionsOptions, 'scopeKey' | 'limit'>
> & Pick<ListResumoAcademicoTextVersionsOptions, 'section' | 'beforeVersionNumber'> {
  const scopeKey = ScopeKeySchema.parse(options.scopeKey)
  const limit = z.number().int().min(1).max(RESUMO_TEXT_VERSION_MAX_LIST_LIMIT).default(50).parse(options.limit)
  const section = options.section === undefined
    ? undefined
    : z.nativeEnum(ResumoAcademicoSection).parse(options.section)
  const beforeVersionNumber = options.beforeVersionNumber === undefined
    ? undefined
    : ProgressRevisionSchema.parse(options.beforeVersionNumber)

  return { scopeKey, limit, section, beforeVersionNumber }
}

async function findOwnedResumoProject(
  database: ResumoTextVersionDatabase,
  projectId: string,
  profileId: string,
): Promise<{ id: string } | null> {
  return database.project.findFirst({
    where: {
      id: projectId,
      profileId,
      type: ProjectType.resumo_academico,
    },
    select: { id: true },
  })
}

async function ensurePreviousVersionBelongsToScope(
  database: ResumoTextVersionDatabase,
  projectId: string,
  scopeKey: string,
  previousVersionId: string,
): Promise<void> {
  const previous = await database.resumoAcademicoTextVersion.findUnique({
    where: { id: previousVersionId },
    select: { id: true, projectId: true, scopeKey: true },
  })

  if (!previous || previous.projectId !== projectId || previous.scopeKey !== scopeKey) {
    throw new Error('A versão anterior não pertence ao projeto e escopo informados.')
  }
}

async function ensureSourceEventBelongsToProject(
  database: ResumoTextVersionDatabase,
  projectId: string,
  sourceEventId: string,
): Promise<void> {
  const event = await database.resumoAcademicoHistoryEvent.findFirst({
    where: { id: sourceEventId, projectId },
    select: { id: true },
  })

  if (!event) throw new Error('O evento de origem não pertence ao projeto informado.')
}

/**
 * Registra uma versão dentro de uma transação já aberta pelo fluxo de domínio.
 * Este caminho não abre uma transação aninhada e não cria eventos de histórico.
 */
export async function createResumoAcademicoTextVersionInTransaction(
  database: ResumoTextVersionDatabase,
  rawInput: CreateResumoAcademicoTextVersionInput,
): Promise<ResumoAcademicoTextVersionRecord | undefined> {
  const input = parseCreateInput(rawInput)
  const hash = contentHash(input.content)
  const origin = normalizeOperation(input.operation)
  const project = await findOwnedResumoProject(database, input.projectId, input.profileId)

  if (!project) return undefined

  if (input.sourceEventId) {
    const existingByEvent = await database.resumoAcademicoTextVersion.findUnique({
      where: { sourceEventId: input.sourceEventId },
      select: textVersionSelect,
    })

    if (existingByEvent) {
      if (
        existingByEvent.projectId !== project.id ||
        existingByEvent.scopeKey !== input.scopeKey ||
        existingByEvent.contentHash !== hash ||
        existingByEvent.progressRevision !== input.progressRevision ||
        existingByEvent.origin !== origin
      ) {
        throw new Error('A chave de idempotência já está associada a outra versão.')
      }

      return toRecord(existingByEvent)
    }

    await ensureSourceEventBelongsToProject(database, project.id, input.sourceEventId)
  }

  const existingByContent = await database.resumoAcademicoTextVersion.findFirst({
    where: {
      projectId: project.id,
      scopeKey: input.scopeKey,
      contentHash: hash,
    },
    orderBy: { versionNumber: 'asc' },
    select: textVersionSelect,
  })

  if (existingByContent) return toRecord(existingByContent)

  const latest = await database.resumoAcademicoTextVersion.findFirst({
    where: { projectId: project.id, scopeKey: input.scopeKey },
    orderBy: { versionNumber: 'desc' },
    select: { id: true, versionNumber: true },
  })

  const previousVersionId = input.previousVersionId ?? latest?.id ?? null
  if (previousVersionId) {
    await ensurePreviousVersionBelongsToScope(database, project.id, input.scopeKey, previousVersionId)
  }

  const created = await database.resumoAcademicoTextVersion.create({
    data: {
      projectId: project.id,
      scopeKey: input.scopeKey,
      section: input.section ?? null,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      progressRevision: input.progressRevision,
      origin,
      content: input.content,
      contentHash: hash,
      previousVersionId,
      sourceEventId: input.sourceEventId ?? null,
    },
    select: textVersionSelect,
  })

  return toRecord(created)
}

async function runSerializable<T>(
  database: TransactionRunner,
  operation: (transaction: ResumoTextVersionDatabase) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await database.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      })
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === MAX_SERIALIZABLE_TRANSACTION_ATTEMPTS - 1) {
        throw error
      }
    }
  }

  throw new Error('A persistência da versão textual excedeu as tentativas de serialização.')
}

/**
 * Registra uma versão com ownership, hash, deduplicação e retry limitado para
 * conflitos de serialização. A versão só é criada dentro da transação.
 */
export async function createResumoAcademicoTextVersion(
  input: CreateResumoAcademicoTextVersionInput,
): Promise<ResumoAcademicoTextVersionRecord | undefined> {
  const parsedInput = parseCreateInput(input)
  return runSerializable(prisma, (transaction) => (
    createResumoAcademicoTextVersionInTransaction(transaction, parsedInput)
  ))
}

async function getOwnedVersionInTransaction(
  database: ResumoTextVersionDatabase,
  projectId: string,
  profileId: string,
  versionId: string,
): Promise<ResumoAcademicoTextVersionRecord | undefined> {
  const project = await findOwnedResumoProject(database, projectId, profileId)
  if (!project) return undefined

  const version = await database.resumoAcademicoTextVersion.findFirst({
    where: { id: versionId, projectId: project.id },
    select: textVersionSelect,
  })

  return version ? toRecord(version) : undefined
}

export async function getOwnedResumoAcademicoTextVersion(
  projectId: string,
  profileId: string,
  versionId: string,
): Promise<ResumoAcademicoTextVersionRecord | undefined> {
  return prisma.$transaction((transaction) => (
    getOwnedVersionInTransaction(transaction, projectId, profileId, versionId)
  ))
}

async function listOwnedVersionsInTransaction(
  database: ResumoTextVersionDatabase,
  projectId: string,
  profileId: string,
  options: ListResumoAcademicoTextVersionsOptions,
): Promise<ResumoAcademicoTextVersionPage | undefined> {
  const project = await findOwnedResumoProject(database, projectId, profileId)
  if (!project) return undefined

  const parsedOptions = validateListOptions(options)
  const versions = await database.resumoAcademicoTextVersion.findMany({
    where: {
      projectId: project.id,
      scopeKey: parsedOptions.scopeKey,
      ...(parsedOptions.section === undefined ? {} : { section: parsedOptions.section }),
      ...(parsedOptions.beforeVersionNumber === undefined
        ? {}
        : { versionNumber: { lt: parsedOptions.beforeVersionNumber } }),
    },
    orderBy: { versionNumber: 'desc' },
    take: parsedOptions.limit + 1,
    select: textVersionSelect,
  })

  const page = versions.slice(0, parsedOptions.limit).map(toRecord)
  return {
    versions: page,
    nextCursor: versions.length > parsedOptions.limit
      ? page.at(-1)?.versionNumber ?? null
      : null,
  }
}

/**
 * Lista versões de um escopo estável. O cursor usa versionNumber porque a
 * unicidade por projeto/escopo torna a paginação determinística.
 */
export async function listOwnedResumoAcademicoTextVersions(
  projectId: string,
  profileId: string,
  options: ListResumoAcademicoTextVersionsOptions,
): Promise<ResumoAcademicoTextVersionPage | undefined> {
  return prisma.$transaction((transaction) => (
    listOwnedVersionsInTransaction(transaction, projectId, profileId, options)
  ))
}
