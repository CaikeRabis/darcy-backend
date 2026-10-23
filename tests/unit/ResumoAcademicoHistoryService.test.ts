import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ResumoAcademicoEventActor,
  ResumoAcademicoEventType,
} from '@prisma/client'
import type { ResumoAcademicoState } from '../../src/schemas/resumoAcademico.schema'

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  progressFindUnique: vi.fn(),
  progressCreate: vi.fn(),
  progressUpdateMany: vi.fn(),
  historyFindFirst: vi.fn(),
  historyFindMany: vi.fn(),
  historyCreate: vi.fn(),
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
      findMany: mocks.historyFindMany,
      create: mocks.historyCreate,
    },
    $transaction: mocks.transaction,
  },
}))

import {
  deriveResumoAcademicoHistoryEvents,
  getResumoAcademicoProgress,
  listOwnedResumoAcademicoHistory,
  upsertResumoAcademicoProgress,
} from '../../src/services/ResumoAcademicoService'

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
    tema: 'Tema de teste',
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
      findMany: mocks.historyFindMany,
      create: mocks.historyCreate,
    },
  }
}

function configureTransactionSuccess(): void {
  mocks.transaction.mockImplementation(async (
    callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
  ) => callback(transactionClient()))
}

function event(sequence: number) {
  return {
    id: `event-${sequence}`,
    projectId: 'project-owned',
    sequence,
    type: ResumoAcademicoEventType.secao_aprovada,
    actor: ResumoAcademicoEventActor.pesquisador,
    section: 'contexto' as const,
    summary: 'Seção Contexto aprovada pelo pesquisador.',
    contentVersionRef: null,
    createdAt: new Date(`2026-10-23T12:00:0${sequence}.000Z`),
  }
}

describe('histórico imutável do Resumo Acadêmico', () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    configureTransactionSuccess()
  })

  it('deriva somente acontecimentos relevantes, ordenados e sem conteúdo acadêmico no resumo', () => {
    const previous = makeProgress()
    const next = makeProgress()
    next.contexto.texto_sugerido = 'Rascunho do contexto.'
    next.contexto.status = 'aprovado'
    next.classificacao_cnpq = {
      versao_catalogo: 'cnpq-tac-2013-04-25',
      primaria: {
        codigo: '7.08.00.00-6',
        nome: 'Educação',
        nivel: 'area',
        caminho_codigos: ['7.00.00.00-0', '7.08.00.00-6'],
      },
    }
    next.decisoes_autorais = [{
      id: 'contexto_problema_central',
      escolha: 'Decisão sintética',
      justificativa: 'Justificativa sintética.',
      atualizada_em: '2026-10-23T12:00:00.000Z',
    }]
    next.resumo_completo = 'Resumo consolidado sintético.'

    const events = deriveResumoAcademicoHistoryEvents(previous, next)

    expect(events.map((item) => item.type)).toEqual([
      ResumoAcademicoEventType.rascunho_gerado,
      ResumoAcademicoEventType.secao_aprovada,
      ResumoAcademicoEventType.decisao_autoral_alterada,
      ResumoAcademicoEventType.classificacao_cientifica_alterada,
      ResumoAcademicoEventType.resumo_consolidado,
    ])
    expect(events.every((item) => item.actor === ResumoAcademicoEventActor.pesquisador)).toBe(true)
    expect(events.map((item) => item.summary).join(' ')).not.toContain('Justificativa sintética.')
    expect(events.map((item) => item.summary).join(' ')).not.toContain('Resumo consolidado sintético.')
  })

  it('não registra evento quando o retry repete o mesmo estado ou só muda o timestamp da decisão', () => {
    const current = makeProgress()
    current.decisoes_autorais = [{
      id: 'contexto_problema_central',
      escolha: 'Decisão estável',
      justificativa: 'Justificativa estável.',
      atualizada_em: '2026-10-23T12:00:00.000Z',
    }]
    const retry = structuredClone(current)
    retry.decisoes_autorais![0].atualizada_em = '2026-10-23T12:01:00.000Z'

    expect(deriveResumoAcademicoHistoryEvents(current, retry)).toEqual([])
  })

  it('retorna revisão zero para projeto legado sem progresso e a revisão persistida quando existente', async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValueOnce(null)

    await expect(getResumoAcademicoProgress('project-owned', 'profile-a')).resolves.toEqual({
      progress: null,
      revision: 0,
    })

    const progress = makeProgress()
    mocks.progressFindUnique.mockResolvedValueOnce({ progress, revision: 4 })
    await expect(getResumoAcademicoProgress('project-owned', 'profile-a')).resolves.toEqual({
      progress,
      revision: 4,
    })

    mocks.projectFindFirst.mockResolvedValue(null)
    await expect(getResumoAcademicoProgress('project-alheio', 'profile-a')).resolves.toBeUndefined()
  })

  it('persiste alteração e eventos na mesma transação, incrementando uma revisão válida', async () => {
    const previous = makeProgress()
    const next = makeProgress()
    next.classificacao_cnpq = {
      versao_catalogo: 'cnpq-tac-2013-04-25',
      primaria: {
        codigo: '7.08.00.00-6',
        nome: 'Educação',
        nivel: 'area',
        caminho_codigos: ['7.00.00.00-0', '7.08.00.00-6'],
      },
    }
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValue({ progress: previous, revision: 7 })
    mocks.historyFindFirst.mockResolvedValue({ sequence: 7 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })
    mocks.historyCreate.mockResolvedValue(event(8))

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', next, 7)).resolves.toEqual({
      status: 'saved',
      progress: next,
      revision: 8,
    })

    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
    const progressUpdateCallOrder = mocks.progressUpdateMany.mock.invocationCallOrder[0]
    const historyCreateCallOrder = mocks.historyCreate.mock.invocationCallOrder[0]
    expect(progressUpdateCallOrder).toBeLessThan(historyCreateCallOrder)
    expect(mocks.progressUpdateMany).toHaveBeenCalledWith({
      where: { projectId: 'project-owned', revision: 7 },
      data: { progress: next, revision: { increment: 1 } },
    })
    expect(mocks.historyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: 'project-owned',
        sequence: 8,
        type: ResumoAcademicoEventType.classificacao_cientifica_alterada,
        actor: ResumoAcademicoEventActor.pesquisador,
      }),
    }))

    mocks.historyFindFirst.mockClear()
    mocks.historyCreate.mockClear()
    mocks.progressUpdateMany.mockClear()
    mocks.progressFindUnique.mockResolvedValue({ progress: next, revision: 8 })
    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', next, 8)).resolves.toEqual({
      status: 'saved',
      progress: next,
      revision: 8,
    })
    expect(mocks.historyCreate).not.toHaveBeenCalled()
    expect(mocks.historyFindFirst).not.toHaveBeenCalled()
    expect(mocks.progressUpdateMany).not.toHaveBeenCalled()
  })

  it('cria o primeiro progresso somente com revisão zero e retorna revisão um', async () => {
    const first = makeProgress()
    first.contexto.texto_sugerido = 'Primeiro rascunho.'
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValue(null)
    mocks.progressCreate.mockResolvedValue({ progress: first, revision: 1 })
    mocks.historyFindFirst.mockResolvedValue(null)

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', first, 0)).resolves.toEqual({
      status: 'saved',
      progress: first,
      revision: 1,
    })
    expect(mocks.progressCreate).toHaveBeenCalledWith({
      data: { projectId: 'project-owned', progress: first, revision: 1 },
      select: { progress: true, revision: true },
    })
  })

  it('não cria progresso inexistente quando expectedRevision não é zero', async () => {
    const first = makeProgress()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValue(null)

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', first, 1)).resolves.toEqual({
      status: 'conflict',
    })
    expect(mocks.progressCreate).not.toHaveBeenCalled()
    expect(mocks.historyCreate).not.toHaveBeenCalled()
  })

  it('rejeita revisão desatualizada sem alterar progresso ou histórico', async () => {
    const current = makeProgress()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValue({ progress: current, revision: 3 })

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', current, 2)).resolves.toEqual({
      status: 'conflict',
    })
    expect(mocks.progressUpdateMany).not.toHaveBeenCalled()
    expect(mocks.historyCreate).not.toHaveBeenCalled()
  })

  it('retorna conflito quando a atualização condicional perde uma corrida', async () => {
    const current = makeProgress()
    const next = makeProgress()
    next.tema = 'Atualização concorrente'
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValue({ progress: current, revision: 3 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 0 })

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', next, 3)).resolves.toEqual({
      status: 'conflict',
    })
    expect(mocks.historyCreate).not.toHaveBeenCalled()
  })

  it.each(['P2034', 'P2002'] as const)(
    'repete uma transação conflitada por %s sem duplicar o evento',
    async (errorCode) => {
    const previous = makeProgress()
    const next = makeProgress()
    next.contexto.texto_sugerido = 'Rascunho de teste.'
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique.mockResolvedValue({ progress: previous, revision: 3 })
    mocks.historyFindFirst.mockResolvedValue({ sequence: 3 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })
    mocks.historyCreate.mockResolvedValue(event(4))
    mocks.transaction
      .mockRejectedValueOnce({ code: errorCode })
      .mockImplementation(async (
        callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
      ) => callback(transactionClient()))

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', next, 3)).resolves.toEqual({
      status: 'saved',
      progress: next,
      revision: 4,
    })

    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(mocks.historyCreate).toHaveBeenCalledTimes(1)
    expect(mocks.historyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sequence: 4 }),
    }))
    },
  )

  it('revalida a revisão depois de um conflito serializável antes de tentar gravar novamente', async () => {
    const previous = makeProgress()
    const next = makeProgress()
    next.tema = 'Mudança local pendente'
    const currentAfterConcurrentSave = makeProgress()
    currentAfterConcurrentSave.tema = 'Mudança de outra sessão'
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique
      .mockResolvedValueOnce({ progress: previous, revision: 2 })
      .mockResolvedValueOnce({ progress: currentAfterConcurrentSave, revision: 3 })
    mocks.progressUpdateMany.mockResolvedValue({ count: 1 })
    mocks.transaction
      .mockImplementationOnce(async (
        callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
      ) => {
        await callback(transactionClient())
        throw { code: 'P2034' }
      })
      .mockImplementation(async (
        callback: (client: ReturnType<typeof transactionClient>) => Promise<unknown>,
      ) => callback(transactionClient()))

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', next, 2)).resolves.toEqual({
      status: 'conflict',
    })
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
  })

  it('trata criação concorrente como conflito após P2002, sem reaplicar o snapshot', async () => {
    const first = makeProgress()
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.progressFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ progress: first, revision: 1 })
    mocks.progressCreate.mockRejectedValueOnce({ code: 'P2002' })

    await expect(upsertResumoAcademicoProgress('project-owned', 'profile-a', first, 0)).resolves.toEqual({
      status: 'conflict',
    })
    expect(mocks.transaction).toHaveBeenCalledTimes(2)
    expect(mocks.historyCreate).not.toHaveBeenCalled()
  })

  it('pagina por sequência, em ordem determinística, somente depois de validar ownership', async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-owned' })
    mocks.historyFindMany.mockResolvedValue([event(9), event(8), event(7)])

    await expect(listOwnedResumoAcademicoHistory('project-owned', 'profile-a', 2, 10)).resolves.toEqual({
      events: [event(9), event(8)],
      nextCursor: 8,
    })
    expect(mocks.historyFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: 'project-owned', sequence: { lt: 10 } },
      orderBy: { sequence: 'desc' },
      take: 3,
    }))

    mocks.projectFindFirst.mockResolvedValue(null)
    mocks.historyFindMany.mockClear()
    await expect(listOwnedResumoAcademicoHistory('project-alheio', 'profile-a', 2)).resolves.toBeUndefined()
    expect(mocks.historyFindMany).not.toHaveBeenCalled()
  })

  it('mantém projetos anteriores legíveis quando ainda não possuem eventos', async () => {
    mocks.projectFindFirst.mockResolvedValue({ id: 'project-legado' })
    mocks.historyFindMany.mockResolvedValue([])

    await expect(listOwnedResumoAcademicoHistory('project-legado', 'profile-a', 25)).resolves.toEqual({
      events: [],
      nextCursor: null,
    })
    expect(mocks.historyFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { projectId: 'project-legado' },
      orderBy: { sequence: 'desc' },
      take: 26,
    }))
  })
})
