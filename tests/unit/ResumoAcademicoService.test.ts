import { beforeEach, describe, expect, it, vi } from 'vitest'

const findFirst = vi.hoisted(() => vi.fn())
const findUnique = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/prisma', () => ({
  prisma: {
    project: { findFirst },
    resumoAcademicoProgress: { findUnique },
  },
}))

import { getOwnedResumoScientificContext } from '../../src/services/ResumoAcademicoService'

const classification = {
  versao_catalogo: 'cnpq-tac-2013-04-25',
  primaria: {
    codigo: '1.03.03.03-0',
    nome: 'Banco de Dados',
    nivel: 'especialidade',
    caminho_codigos: ['1.00.00.00-3', '1.03.00.00-7', '1.03.03.00-6', '1.03.03.03-0'],
  },
}

describe('getOwnedResumoScientificContext', () => {
  beforeEach(() => {
    findFirst.mockReset()
    findUnique.mockReset()
  })

  it('não expõe contexto quando o projeto não pertence ao perfil autenticado', async () => {
    findFirst.mockResolvedValue(null)

    await expect(getOwnedResumoScientificContext('project-alheio', 'perfil-atual')).resolves.toBeUndefined()
    expect(findUnique).not.toHaveBeenCalled()
  })

  it('recupera somente classificação e decisão persistidas no projeto pertencente', async () => {
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({
      progress: {
        classificacao_cnpq: classification,
        decisoes_autorais: [{
          id: 'contexto_problema_central',
          escolha: 'Baixa adoção',
          justificativa: 'Prioridade relatada pelo pesquisador.',
          atualizada_em: '2026-10-21T12:00:00.000Z',
        }],
      },
    })

    await expect(getOwnedResumoScientificContext('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      classificacaoCnpqContextual: {
        versaoCatalogo: 'cnpq-tac-2013-04-25',
        primaria: {
          codigo: '1.03.03.03-0',
          nome: 'Banco de Dados',
          nivel: 'especialidade',
          caminhoCodigos: ['1.00.00.00-3', '1.03.00.00-7', '1.03.03.00-6', '1.03.03.03-0'],
        },
        correlatas: [],
      },
      decisaoAutoralContextual: 'Problema central escolhido pelo pesquisador: Baixa adoção\nJustificativa informada pelo pesquisador: Prioridade relatada pelo pesquisador.',
    })
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'project-do-perfil', profileId: 'perfil-atual' }),
    }))
  })

  it('trata classificação desconhecida como não confirmada e preserva a decisão autoral', async () => {
    findFirst.mockResolvedValue({ id: 'project-do-perfil' })
    findUnique.mockResolvedValue({
      progress: {
        classificacao_cnpq: {
          ...classification,
          primaria: { ...classification.primaria, nome: 'Nome manipulado' },
        },
        decisoes_autorais: [{
          id: 'contexto_problema_central',
          escolha: 'Baixa adoção',
          justificativa: 'Prioridade relatada pelo pesquisador.',
          atualizada_em: '2026-10-21T12:00:00.000Z',
        }],
      },
    })

    await expect(getOwnedResumoScientificContext('project-do-perfil', 'perfil-atual')).resolves.toEqual({
      classificacaoCnpqContextual: null,
      decisaoAutoralContextual: 'Problema central escolhido pelo pesquisador: Baixa adoção\nJustificativa informada pelo pesquisador: Prioridade relatada pelo pesquisador.',
    })
  })
})
