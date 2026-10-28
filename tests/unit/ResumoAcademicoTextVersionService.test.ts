import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma, ResumoAcademicoTextOrigin } from '@prisma/client'
import { createHash } from 'node:crypto'

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  versionFindUnique: vi.fn(),
  versionFindFirst: vi.fn(),
  versionFindMany: vi.fn(),
  versionCreate: vi.fn(),
  historyFindFirst: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst },
    resumoAcademicoTextVersion: {
      findUnique: mocks.versionFindUnique,
      findFirst: mocks.versionFindFirst,
      findMany: mocks.versionFindMany,
      create: mocks.versionCreate,
    },
    resumoAcademicoHistoryEvent: { findFirst: mocks.historyFindFirst },
    $transaction: mocks.transaction,
  },
}))

import {
  createResumoAcademicoTextVersion,
  getOwnedResumoAcademicoTextVersion,
  listOwnedResumoAcademicoTextVersions,
} from '../../src/services/ResumoAcademicoTextVersionService'

function transactionClient() {
  return {
    project: { findFirst: mocks.projectFindFirst },
    resumoAcademicoTextVersion: {
      findUnique: mocks.versionFindUnique,
      findFirst: mocks.versionFindFirst,
      findMany: mocks.versionFindMany,
      create: mocks.versionCreate,
    },
    resumoAcademicoHistoryEvent: { findFirst: mocks.historyFindFirst },
  }
}

function configureTransactionSuccess(): void {
  mocks.transaction.mockImplementation(async (
    callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
  ) => callback(transactionClient()))
}

function version(overrides: Partial<{
  id: string
  projectId: string
  scopeKey: string
  section: 'contexto' | null
  versionNumber: number
  progressRevision: number
  origin: ResumoAcademicoTextOrigin
  content: string
  contentHash: string
  previousVersionId: string | null
  sourceEventId: string | null
}> = {}) {
  return {
    id: 'version-1',
    projectId: 'project-owned',
    scopeKey: 'contexto',
    section: 'contexto' as const,
    versionNumber: 1,
    progressRevision: 3,
    origin: ResumoAcademicoTextOrigin.pesquisador,
    content: 'Texto acadêmico persistido.',
    contentHash: createHash('sha256').update('Texto acadêmico persistido.', 'utf8').digest('hex'),
    previousVersionId: null,
    sourceEventId: null,
    createdAt: new Date('2026-10-28T12:00:00.000Z'),
    ...overrides,
  }
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'project-owned',
    profileId: 'profile-a',
    scopeKey: 'contexto',
    section: 'contexto' as const,
    progressRevision: 3,
    content: 'Texto acadêmico persistido.',
    operation: 'researcher_confirmation' as const,
    ...overrides,
  }
}

describe('serviço autenticado de versões textuais do Resumo Acadêmico', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    configureTransactionSuccess()
  })

  it('cria uma versão com hash, revisão e ownership do projeto', async () => {
    const created = version()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
    mocks.versionCreate.mockResolvedValue(created)

    await expect(createResumoAcademicoTextVersion(input())).resolves.toEqual(created)

    expect(mocks.projectFindFirst).toHaveBeenCalledWith({
      where: {
        id: 'project-owned',
        profileId: 'profile-a',
        type: 'resumo_academico',
      },
      select: { id: true },
    })
    expect(mocks.versionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: 'project-owned',
        versionNumber: 1,
        progressRevision: 3,
        origin: 'pesquisador',
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    }))
    expect(mocks.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )
  })

  it('deduplica conteúdo idêntico sem criar nova versão', async () => {
    const existing = version({ versionNumber: 2 })
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindFirst.mockResolvedValue(existing)

    await expect(createResumoAcademicoTextVersion(input({
      progressRevision: 9,
      operation: 'ai_generation',
    }))).resolves.toEqual(existing)

    expect(mocks.versionCreate).not.toHaveBeenCalled()
  })

  it('torna tentativas repetidas com a mesma origem idempotentes', async () => {
    const existing = version({ sourceEventId: 'event-1' })
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindUnique.mockResolvedValue(existing)

    await expect(createResumoAcademicoTextVersion(input({
      sourceEventId: 'event-1',
    }))).resolves.toEqual(existing)

    expect(mocks.versionFindFirst).not.toHaveBeenCalled()
    expect(mocks.versionCreate).not.toHaveBeenCalled()
  })

  it('rejeita reutilização de origem com conteúdo ou revisão divergentes', async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindUnique.mockResolvedValue(version({ sourceEventId: 'event-1' }))

    await expect(createResumoAcademicoTextVersion(input({
      sourceEventId: 'event-1',
      content: 'Outro conteúdo.',
    }))).rejects.toThrow('chave de idempotência')
  })

  it('não consulta nem cria versões quando o projeto não pertence ao perfil', async () => {
    mocks.projectFindFirst.mockResolvedValue(null)

    await expect(createResumoAcademicoTextVersion(input({ profileId: 'profile-b' }))).resolves.toBeUndefined()

    expect(mocks.versionFindUnique).not.toHaveBeenCalled()
    expect(mocks.versionFindFirst).not.toHaveBeenCalled()
    expect(mocks.versionCreate).not.toHaveBeenCalled()
  })

  it('valida limite de conteúdo, escopo, revisão e operação antes da transação', async () => {
    await expect(createResumoAcademicoTextVersion(input({
      content: 'x'.repeat(200_001),
    }))).rejects.toThrow()
    await expect(createResumoAcademicoTextVersion(input({ scopeKey: 'escopo inválido' }))).rejects.toThrow()
    await expect(createResumoAcademicoTextVersion(input({ progressRevision: -1 }))).rejects.toThrow()
    await expect(createResumoAcademicoTextVersion(input({ operation: 'cliente' }))).rejects.toThrow()

    expect(mocks.transaction).not.toHaveBeenCalled()
  })

  it('valida a linhagem antes de associar uma versão anterior', async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'version-current', versionNumber: 1 })
    mocks.versionFindUnique.mockResolvedValue({
      id: 'version-other-scope',
      projectId: 'project-owned',
      scopeKey: 'objetivo',
    })

    await expect(createResumoAcademicoTextVersion(input({
      previousVersionId: 'version-other-scope',
      content: 'Nova versão.',
    }))).rejects.toThrow('versão anterior')
    expect(mocks.versionCreate).not.toHaveBeenCalled()
  })

  it('valida o evento de origem no mesmo projeto', async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindUnique.mockResolvedValue(null)
    mocks.historyFindFirst.mockResolvedValue(null)

    await expect(createResumoAcademicoTextVersion(input({
      sourceEventId: 'event-other-project',
    }))).rejects.toThrow('evento de origem')
    expect(mocks.versionCreate).not.toHaveBeenCalled()
  })

  it('retenta conflitos P2034/P2002 sem expor fallback ou criar atualização', async () => {
    const created = version()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(created)
    mocks.versionCreate.mockResolvedValueOnce(created)
    mocks.transaction
      .mockImplementationOnce(async (
        callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
      ) => {
        await callback(transactionClient())
        throw { code: 'P2002' }
      })
      .mockImplementationOnce(async (
        callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
      ) => callback(transactionClient()))

    await expect(createResumoAcademicoTextVersion(input())).resolves.toEqual(created)
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(mocks.versionCreate).toHaveBeenCalledTimes(1)
  })

  it('lista por escopo com paginação determinística e ownership', async () => {
    const entries = [version({ versionNumber: 4 }), version({ versionNumber: 3 }), version({ versionNumber: 2 })]
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindMany.mockResolvedValue(entries)

    await expect(listOwnedResumoAcademicoTextVersions('project-owned', 'profile-a', {
      scopeKey: 'contexto',
      limit: 2,
      beforeVersionNumber: 5,
    })).resolves.toEqual({
      versions: entries.slice(0, 2),
      nextCursor: 3,
    })
    expect(mocks.versionFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        projectId: 'project-owned',
        scopeKey: 'contexto',
        versionNumber: { lt: 5 },
      },
      orderBy: { versionNumber: 'desc' },
      take: 3,
    }))

    mocks.projectFindFirst.mockResolvedValue(null)
    mocks.versionFindMany.mockClear()
    await expect(listOwnedResumoAcademicoTextVersions('project-other', 'profile-a', {
      scopeKey: 'contexto',
    })).resolves.toBeUndefined()
    expect(mocks.versionFindMany).not.toHaveBeenCalled()
  })

  it('consulta uma versão específica somente após validar ownership', async () => {
    const existing = version()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.versionFindFirst.mockResolvedValue(existing)

    await expect(getOwnedResumoAcademicoTextVersion('project-owned', 'profile-a', 'version-1'))
      .resolves.toEqual(existing)
    expect(mocks.versionFindFirst).toHaveBeenCalledWith({
      where: { id: 'version-1', projectId: 'project-owned' },
      select: expect.any(Object),
    })
  })
})
