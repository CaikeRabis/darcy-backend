import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  progressFindUnique: vi.fn(),
  progressCreate: vi.fn(),
  progressUpdateMany: vi.fn(),
  historyFindFirst: vi.fn(),
  historyCreate: vi.fn(),
  historyUpdate: vi.fn(),
  createTextVersion: vi.fn(),
  transaction: vi.fn(),
}))

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst },
    resumoAcademicoProgress: {
      findUnique: mocks.progressFindUnique,
      create: mocks.progressCreate,
      updateMany: mocks.progressUpdateMany,
    },
    resumoAcademicoHistoryEvent: {
      findFirst: mocks.historyFindFirst,
      create: mocks.historyCreate,
      update: mocks.historyUpdate,
    },
    resumoAcademicoTextVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: mocks.transaction,
  },
}))

vi.mock('../../src/services/ResumoAcademicoTextVersionService', () => ({
  createResumoAcademicoTextVersionInTransaction: mocks.createTextVersion,
}))

import {
  approveResumoAcademicoSection,
  consolidateResumoAcademico,
  upsertResumoAcademicoProgress,
} from '../../src/services/ResumoAcademicoService'
import type { ResumoAcademicoState } from '../../src/schemas/resumoAcademico.schema'

function makeProgress(): ResumoAcademicoState {
  const section = () => ({
    respostas_usuario: {},
    diagnostico: '',
    lacunas: [],
    texto_sugerido: '',
    status: 'pendente' as const,
  })

  return {
    titulo_provisorio: '',
    tema: 'Tema sintético',
    area_conhecimento: '',
    nivel_academico: 'Mestrado',
    estagio_pesquisa: 'em_andamento',
    contexto: section(),
    objetivo: section(),
    metodologia: section(),
    fundamentacao_teorica: section(),
    resultados: { ...section(), tipo: '' },
    resumo_completo: '',
    numero_palavras: 0,
    limite_palavras: 250,
    avaliacao_final: {
      coerencia: '',
      clareza: '',
      coesao: '',
      adequacao_academica: '',
      problemas_identificados: [],
      sugestoes: [],
    },
  }
}

function transactionClient() {
  return {
    project: { findFirst: mocks.projectFindFirst },
    resumoAcademicoProgress: {
      findUnique: mocks.progressFindUnique,
      create: mocks.progressCreate,
      updateMany: mocks.progressUpdateMany,
    },
    resumoAcademicoHistoryEvent: {
      findFirst: mocks.historyFindFirst,
      create: mocks.historyCreate,
      update: mocks.historyUpdate,
    },
    resumoAcademicoTextVersion: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  }
}

function configureTransaction(): void {
  mocks.transaction.mockImplementation(async (
    callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
  ) => callback(transactionClient()))
}

describe('marcos acadêmicos transacionais', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    configureTransaction()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.historyFindFirst.mockResolvedValue(null)
    mocks.historyCreate.mockResolvedValue({ id: 'event-1' })
    mocks.historyUpdate.mockResolvedValue({ id: 'event-1' })
    mocks.createTextVersion.mockResolvedValue({ id: 'version-1' })
  })

  it('aprovação explícita cria evento, versão vinculada e nova revisão', async () => {
    const previous = makeProgress()
    previous.contexto.texto_sugerido = 'Texto aprovado.'
    const next = structuredClone(previous)
    next.contexto.status = 'aprovado'
    mocks.progressFindUnique.mockResolvedValue({ progress: previous, revision: 3 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })

    await expect(approveResumoAcademicoSection(
      'project-owned',
      'profile-a',
      next,
      3,
      'contexto',
    )).resolves.toEqual({ status: 'saved', progress: next, revision: 4 })

    expect(mocks.historyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ type: 'secao_aprovada', section: 'contexto' }),
    }))
    expect(mocks.createTextVersion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      scopeKey: 'secao.contexto',
      section: 'contexto',
      progressRevision: 4,
      operation: 'researcher_confirmation',
      sourceEventId: 'event-1',
    }))
    expect(mocks.historyUpdate).toHaveBeenCalledWith({
      where: { id: 'event-1' },
      data: { contentVersionRef: 'version-1' },
    })
  })

  it('consolidação explícita cria marco mesmo quando o texto já estava persistido', async () => {
    const progress = makeProgress()
    progress.resumo_completo = 'Resumo consolidado.'
    progress.numero_palavras = 2
    mocks.progressFindUnique.mockResolvedValue({ progress, revision: 5 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })

    await expect(consolidateResumoAcademico(
      'project-owned',
      'profile-a',
      progress,
      5,
    )).resolves.toEqual({ status: 'saved', progress, revision: 6 })

    expect(mocks.createTextVersion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      scopeKey: 'resumo_completo',
      section: null,
      content: 'Resumo consolidado.',
      progressRevision: 6,
      sourceEventId: 'event-1',
    }))
  })

  it('não transforma um primeiro snapshot em marco sem autosave anterior', async () => {
    const progress = makeProgress()
    progress.resumo_completo = 'Resumo ainda não persistido.'
    mocks.progressFindUnique.mockResolvedValue(null)

    await expect(consolidateResumoAcademico(
      'project-owned',
      'profile-a',
      progress,
      0,
    )).resolves.toEqual({
      status: 'invalid_milestone',
      message: 'O marco acadêmico requer texto previamente persistido por autosave.',
    })

    expect(mocks.progressCreate).not.toHaveBeenCalled()
    expect(mocks.historyCreate).not.toHaveBeenCalled()
    expect(mocks.createTextVersion).not.toHaveBeenCalled()
  })

  it('propaga falha da versão para permitir rollback da transação inteira', async () => {
    const previous = makeProgress()
    previous.contexto.texto_sugerido = 'Texto previamente persistido.'
    const next = structuredClone(previous)
    next.contexto.status = 'aprovado'
    mocks.progressFindUnique.mockResolvedValue({ progress: previous, revision: 8 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })
    mocks.createTextVersion.mockRejectedValueOnce(new Error('falha controlada na versão'))

    await expect(approveResumoAcademicoSection(
      'project-owned',
      'profile-a',
      next,
      8,
      'contexto',
    )).rejects.toThrow('falha controlada na versão')

    expect(mocks.progressUpdateMany).toHaveBeenCalledTimes(1)
    expect(mocks.historyCreate).toHaveBeenCalledTimes(1)
    expect(mocks.historyUpdate).not.toHaveBeenCalled()
  })

  it('não cria versão em autosave genérico', async () => {
    const previous = makeProgress()
    previous.contexto.status = 'aprovado'
    previous.contexto.texto_sugerido = 'Texto aprovado anteriormente.'
    const next = structuredClone(previous)
    next.contexto.respostas_usuario = { problema_central: 'Alteração intermediária' }
    mocks.progressFindUnique.mockResolvedValue({ progress: previous, revision: 2 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', next, 2))
      .resolves.toEqual({ status: 'saved', progress: next, revision: 3 })

    expect(mocks.createTextVersion).not.toHaveBeenCalled()
  })

  it('mantém compatibilidade com projeto legado sem linha de progresso', async () => {
    const progress = makeProgress()
    mocks.progressFindUnique.mockResolvedValue(null)
    mocks.progressCreate.mockResolvedValue({ progress, revision: 1 })

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', progress, 0))
      .resolves.toEqual({ status: 'saved', progress, revision: 1 })

    expect(mocks.progressCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ projectId: 'project-owned', revision: 1 }),
    }))
    expect(mocks.createTextVersion).not.toHaveBeenCalled()
  })

  it('retorna conflito sem efeitos colaterais', async () => {
    const progress = makeProgress()
    progress.resumo_completo = 'Resumo consolidado.'
    mocks.progressFindUnique.mockResolvedValue({ progress, revision: 7 })

    await expect(consolidateResumoAcademico('project-owned', 'profile-a', progress, 6))
      .resolves.toEqual({ status: 'conflict' })

    expect(mocks.progressUpdateMany).not.toHaveBeenCalled()
    expect(mocks.historyCreate).not.toHaveBeenCalled()
    expect(mocks.createTextVersion).not.toHaveBeenCalled()
  })

  it('rejeita marco sem texto válido antes de abrir transação', async () => {
    const progress = makeProgress()

    await expect(approveResumoAcademicoSection(
      'project-owned',
      'profile-a',
      progress,
      0,
      'contexto',
    )).resolves.toEqual({
      status: 'invalid_milestone',
      message: 'A seção aprovada precisa possuir texto persistido e status aprovado.',
    })

    expect(mocks.transaction).toHaveBeenCalledTimes(1)
    expect(mocks.progressFindUnique).not.toHaveBeenCalled()
  })

  it('preserva ownership e não acessa o progresso de outro perfil', async () => {
    mocks.projectFindFirst.mockResolvedValue(null)
    const progress = makeProgress()
    progress.resumo_completo = 'Resumo consolidado.'

    await expect(consolidateResumoAcademico('project-owned', 'profile-b', progress, 0))
      .resolves.toBeUndefined()

    expect(mocks.progressFindUnique).not.toHaveBeenCalled()
    expect(mocks.createTextVersion).not.toHaveBeenCalled()
  })
})
