import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())
const textVersionFindFirst = vi.hoisted(() => vi.fn())
const progressCreate = vi.hoisted(() => vi.fn())
const progressUpdateMany = vi.hoisted(() => vi.fn())
const transaction = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst },
    resumoAcademicoProgress: { findUnique, create: progressCreate, updateMany: progressUpdateMany },
    resumoAcademicoTextVersion: { findFirst: textVersionFindFirst },
    $transaction: transaction,
  },
}))

import {
  RESUMO_SCIENTIFIC_CONTEXT_MAX_FIELD_LENGTH,
  getOwnedResumoScientificContextSnapshot,
} from '../../src/services/ResumoAcademicoService'
import { resolveCnpqCatalogEntry } from '../../src/services/cnpqTaxonomy'
import type { ResumoAcademicoState } from '../../src/schemas/resumoAcademico.schema'

const classification: NonNullable<ResumoAcademicoState['classificacao_cnpq']> = {
  versao_catalogo: 'cnpq-tac-2013-04-25',
  primaria: {
    codigo: '1.03.03.03-0',
    nome: 'Banco de Dados',
    nivel: 'especialidade',
    caminho_codigos: ['1.00.00.00-3', '1.03.00.00-7', '1.03.03.00-6', '1.03.03.03-0'],
  },
}

function section(
  status: 'pendente' | 'em_revisao' | 'aprovado' = 'pendente',
  respostas_usuario: Record<string, string> = {},
) {
  return {
    respostas_usuario,
    diagnostico: '',
    lacunas: [],
    texto_sugerido: '',
    status,
  }
}

function progress(): ResumoAcademicoState {
  return {
    titulo_provisorio: 'Título provisório',
    tema: 'Tema de pesquisa',
    area_conhecimento: 'Banco de Dados',
    classificacao_cnpq: classification,
    nivel_academico: 'Mestrado',
    estagio_pesquisa: 'em_andamento' as const,
    identificacao_inicial_concluida: true,
    contexto: section('em_revisao', { problema_central: 'Baixa adoção da tecnologia.' }),
    objetivo: section('em_revisao', {
      objetivo_geral: 'Analisar fatores de adoção.',
      objetivos_especificos: 'Mapear barreiras; comparar percepções',
    }),
    metodologia: section('em_revisao', {
      abordagem: 'Qualitativa.',
      procedimentos: 'Entrevistas semiestruturadas.',
    }),
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

describe('getOwnedResumoScientificContextSnapshot', () => {
  beforeEach(() => {
    findFirst.mockReset()
    findUnique.mockReset()
    textVersionFindFirst.mockReset()
    progressCreate.mockReset()
    progressUpdateMany.mockReset()
    transaction.mockReset()
  })

  it('não lê progresso quando o projeto não pertence ao perfil autenticado', async () => {
    findFirst.mockResolvedValue(null)

    await expect(getOwnedResumoScientificContextSnapshot('project-alheio', 'perfil-atual')).resolves.toBeUndefined()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('retorna campos ausentes e revisão zero para projeto legado sem progresso', async () => {
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue(null)

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        projectId: 'project-do-perfil',
        revision: 0,
        progressState: 'ausente',
        researchProblem: { state: 'ausente', origin: 'nenhuma', value: null },
        methodology: { state: 'ausente', origin: 'nenhuma', items: [] },
      }),
    })
  })

  it('normaliza contexto persistido sem transformar rascunhos em confirmação autoral', async () => {
    const persisted = progress()
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 7 })

    const result = await getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual', 7)

    expect(result).toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        projectId: 'project-do-perfil',
        revision: 7,
        progressState: 'rascunho_persistido',
        researchProblem: {
          state: 'rascunho_persistido',
          origin: 'resposta_usuario_persistida',
          value: 'Baixa adoção da tecnologia.',
        },
        generalObjective: {
          state: 'rascunho_persistido',
          origin: 'resposta_usuario_persistida',
          value: 'Analisar fatores de adoção.',
        },
        specificObjectives: {
          state: 'rascunho_persistido',
          origin: 'resposta_usuario_persistida',
          values: ['Mapear barreiras', 'comparar percepções'],
        },
        methodology: expect.objectContaining({
          state: 'rascunho_persistido',
          origin: 'resposta_usuario_persistida',
          items: [
            { questionId: 'abordagem', value: 'Qualitativa.' },
            { questionId: 'procedimentos', value: 'Entrevistas semiestruturadas.' },
          ],
        }),
        scientificClassification: expect.objectContaining({
          state: 'confirmado',
          origin: 'classificacao_cnpq_persistida',
        }),
        researchStage: {
          state: 'confirmado',
          origin: 'identificacao_persistida',
          value: 'em_andamento',
        },
      }),
    })
    expect(findUnique).toHaveBeenCalledWith({
      where: { projectId: 'project-do-perfil' },
      select: { progress: true, revision: true },
    })
    expect(progressCreate).not.toHaveBeenCalled()
    expect(progressUpdateMany).not.toHaveBeenCalled()
    expect(transaction).not.toHaveBeenCalled()
  })

  it('usa somente a decisão autoral existente como problema confirmado', async () => {
    const persisted = progress()
    persisted.contexto.status = 'aprovado'
    persisted.decisoes_autorais = [{
      id: 'contexto_problema_central',
      escolha: 'Problema confirmado pela pesquisadora.',
      justificativa: 'Justificativa registrada.',
      atualizada_em: '2026-11-19T12:00:00.000Z',
    }]
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 8 })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        researchProblem: {
          state: 'confirmado',
          origin: 'decisao_autoral',
          value: 'Problema confirmado pela pesquisadora.',
        },
        authorialDecisions: persisted.decisoes_autorais,
      }),
    })
  })

  it('não trata status aprovado sem versão de confirmação como confirmação autoral', async () => {
    const persisted = progress()
    persisted.contexto.status = 'aprovado'
    persisted.contexto.texto_sugerido = 'Texto marcado como aprovado pelo autosave.'
    persisted.contexto.respostas_usuario.problema_central = 'Problema sem confirmação explícita.'
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 8 })
    textVersionFindFirst.mockResolvedValue(null)

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        researchProblem: {
          state: 'rascunho_persistido',
          origin: 'resposta_usuario_persistida',
          value: 'Problema sem confirmação explícita.',
        },
      }),
    })
  })

  it('reconhece aprovação somente quando existe versão textual vinculada a evento', async () => {
    const persisted = progress()
    persisted.contexto.status = 'aprovado'
    persisted.contexto.texto_sugerido = 'Texto aprovado explicitamente.'
    persisted.contexto.respostas_usuario.problema_central = 'Problema persistido.'
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 8 })
    textVersionFindFirst.mockResolvedValue({ id: 'version-approval' })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        researchProblem: { state: 'confirmado', origin: 'resposta_usuario_persistida', value: 'Problema persistido.' },
      }),
    })
    expect(textVersionFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        scopeKey: 'secao.contexto',
        progressRevision: 8,
        sourceEventId: { not: null },
      }),
    }))
  })

  it('não promove resposta de autosave posterior à versão formal anterior', async () => {
    const persisted = progress()
    persisted.contexto.status = 'aprovado'
    persisted.contexto.texto_sugerido = 'Texto aprovado explicitamente.'
    persisted.contexto.respostas_usuario.problema_central = 'Problema alterado depois da aprovação.'
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 9 })
    textVersionFindFirst.mockImplementation(({ where }: { where: { progressRevision: number } }) =>
      where.progressRevision === 8 ? { id: 'version-approval' } : null)

    const result = await getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual', 9)
    expect(result?.status).toBe('found')
    if (result?.status === 'found') {
      expect(result.snapshot.researchProblem.state).toBe('rascunho_persistido')
    }
  })

  it('recusa uma revisão divergente antes de expor o snapshot', async () => {
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: progress(), revision: 4 })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual', 3)).resolves.toEqual({
      status: 'conflict',
      revision: 4,
    })
  })

  it('redige dados inválidos do JSONB em vez de tratá-los como contexto científico', async () => {
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: { tema: 'incompleto' }, revision: 2 })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        revision: 2,
        progressState: 'invalido',
        researchProblem: { state: 'invalido', origin: 'progresso_invalido', value: null },
        scientificClassification: { state: 'invalido', origin: 'progresso_invalido', value: null },
      }),
    })
  })

  it('preserva compatibilidade com estado legado válido sem classificação ou decisão', async () => {
    const persisted = progress()
    delete persisted.classificacao_cnpq
    delete persisted.identificacao_inicial_concluida
    persisted.metodologia = section()
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 5 })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        scientificClassification: { state: 'ausente', origin: 'nenhuma', value: null },
        researchStage: {
          state: 'rascunho_persistido',
          origin: 'identificacao_persistida',
          value: 'em_andamento',
        },
        methodology: { state: 'ausente', origin: 'nenhuma', items: [] },
      }),
    })
  })

  it('preserva a classificação CNPq interdisciplinar validada no snapshot', async () => {
    const persisted = progress()
    const correlata = resolveCnpqCatalogEntry('1.02.02.08-0')
    expect(correlata).not.toBeNull()
    persisted.classificacao_cnpq = {
      ...classification,
      correlatas: correlata ? [correlata] : [],
      observacao_interdisciplinar: 'Integra métodos computacionais e estatísticos.',
    }
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 6 })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        scientificClassification: expect.objectContaining({
          state: 'confirmado',
          value: expect.objectContaining({
            correlatas: [expect.objectContaining({ codigo: '1.02.02.08-0' })],
            observacaoInterdisciplinar: 'Integra métodos computacionais e estatísticos.',
          }),
        }),
      }),
    })
  })

  it('marca campo excedente como inválido sem truncar seu conteúdo', async () => {
    const persisted = progress()
    persisted.objetivo.respostas_usuario.objetivo_geral = 'x'.repeat(
      RESUMO_SCIENTIFIC_CONTEXT_MAX_FIELD_LENGTH + 1,
    )
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({ progress: persisted, revision: 9 })

    await expect(getOwnedResumoScientificContextSnapshot('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      status: 'found',
      snapshot: expect.objectContaining({
        progressState: 'rascunho_persistido',
        generalObjective: { state: 'invalido', origin: 'resposta_usuario_persistida', value: null },
      }),
    })
  })
})
