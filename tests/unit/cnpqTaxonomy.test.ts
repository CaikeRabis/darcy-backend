import { describe, expect, it } from 'vitest'

import {
  ClassificacaoCnpqSchema,
  ResumoAcademicoStateSchema,
} from '../../src/schemas/resumoAcademico.schema'
import {
  CNPQ_CATALOG_VERSION,
  resolveCnpqCatalogEntry,
} from '../../src/services/cnpqTaxonomy'

function requiredEntry(codigo: string) {
  const entry = resolveCnpqCatalogEntry(codigo)
  if (!entry) throw new Error(`Código de fixture não encontrado: ${codigo}`)
  return entry
}

function legacyProgressWithoutArea() {
  const etapa = {
    respostas_usuario: {},
    diagnostico: '',
    lacunas: [],
    texto_sugerido: '',
    status: 'pendente',
  } as const

  return {
    titulo_provisorio: 'Projeto legado',
    tema: 'Tema legado',
    nivel_academico: 'mestrado',
    estagio_pesquisa: 'nao_iniciado',
    contexto: etapa,
    objetivo: etapa,
    metodologia: etapa,
    fundamentacao_teorica: etapa,
    resultados: { ...etapa, tipo: '' },
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

describe('snapshot e resolvedor CNPq', () => {
  it('resolve código oficial e toda a cadeia hierárquica', () => {
    expect(requiredEntry('1.03.03.03-0')).toEqual({
      codigo: '1.03.03.03-0',
      nome: 'Banco de Dados',
      nivel: 'especialidade',
      caminho_codigos: [
        '1.00.00.00-3',
        '1.03.00.00-7',
        '1.03.03.00-6',
        '1.03.03.03-0',
      ],
    })
  })

  it.each(['1.03.03.99-9', '1.00.01.00-0', 'codigo-invalido'])(
    'rejeita código inexistente ou estrutura hierárquica impossível: %s',
    (codigo) => {
      expect(resolveCnpqCatalogEntry(codigo)).toBeNull()
    },
  )

  it('aceita classificação principal com correlata oficial distinta', () => {
    const parsed = ClassificacaoCnpqSchema.safeParse({
      versao_catalogo: CNPQ_CATALOG_VERSION,
      primaria: requiredEntry('1.03.03.03-0'),
      correlatas: [requiredEntry('1.02.02.08-0')],
      observacao_interdisciplinar: 'Integra métodos computacionais e estatísticos.',
    })

    expect(parsed.success).toBe(true)
  })

  it('rejeita nome, versão, cadeia e correlata duplicada manipulados pelo cliente', () => {
    const primaria = requiredEntry('1.03.03.03-0')

    expect(ClassificacaoCnpqSchema.safeParse({
      versao_catalogo: 'outra-versao',
      primaria,
    }).success).toBe(false)

    expect(ClassificacaoCnpqSchema.safeParse({
      versao_catalogo: CNPQ_CATALOG_VERSION,
      primaria: { ...primaria, nome: 'Nome inventado', caminho_codigos: ['1.03.03.03-0'] },
      correlatas: [primaria],
    }).success).toBe(false)
  })

  it('normaliza progresso legado sem área e sem classificação estruturada', () => {
    const parsed = ResumoAcademicoStateSchema.safeParse(legacyProgressWithoutArea())

    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.area_conhecimento).toBe('')
      expect(parsed.data.classificacao_cnpq).toBeUndefined()
    }
  })
})
