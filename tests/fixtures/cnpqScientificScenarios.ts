import type { OwnedResumoScientificContext } from '../../src/services/ResumoAcademicoService'
import {
  CNPQ_CATALOG_VERSION,
  resolveCnpqCatalogEntry,
  type CnpqClassification,
} from '../../src/services/cnpqTaxonomy'

export interface ScientificScenario {
  id: string
  titulo: string
  instrucao: string
  codigoPrimario?: string
  codigosCorrelatos?: string[]
  observacaoInterdisciplinar?: string
  decisaoAutoral?: string
}

export const SCIENTIFIC_SCENARIOS: readonly ScientificScenario[] = [
  {
    id: 'educacao-formacao-docente',
    titulo: 'Formação docente para práticas reflexivas',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '7.08.00.00-6',
    decisaoAutoral: 'Problema central escolhido pelo pesquisador: lacunas na formação docente.\nJustificativa informada pelo pesquisador: a decisão decorre de relatos do contexto escolar.',
  },
  {
    id: 'linguistica-variacao',
    titulo: 'Variação linguística em interações urbanas',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '8.01.04.00-2',
  },
  {
    id: 'computacao-governanca-dados',
    titulo: 'Governança de dados em instituições públicas',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '1.03.03.03-0',
  },
  {
    id: 'saude-prontuario-eletronico',
    titulo: 'Prontuário eletrônico na atenção primária',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '4.04.06.00-8',
  },
  {
    id: 'engenharia-durabilidade-materiais',
    titulo: 'Durabilidade de materiais de construção',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '3.01.00.00-3',
  },
  {
    id: 'sociais-politicas-habitacionais',
    titulo: 'Políticas habitacionais e acesso à moradia',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '6.10.02.05-4',
  },
  {
    id: 'interdisciplinar-ia-ensino',
    titulo: 'IA no ensino: mediação e aprendizagem',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '7.08.00.00-6',
    codigosCorrelatos: ['7.08.01.06-1'],
    observacaoInterdisciplinar: 'O projeto articula práticas educacionais e processos de aprendizagem.',
  },
  {
    id: 'legado-sem-classificacao',
    titulo: 'Projeto legado sem classificação estruturada',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
  },
  {
    id: 'interdisciplinar-saude-decisao',
    titulo: 'Sistemas de apoio à decisão em saúde',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '3.13.00.00-6',
    codigosCorrelatos: ['4.04.06.00-8'],
    observacaoInterdisciplinar: 'O recorte considera a colaboração entre tecnologia biomédica e saúde pública.',
  },
  {
    id: 'contraste-ia-ensino-educacao',
    titulo: 'IA no ensino: mediação e aprendizagem',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '7.08.00.00-6',
  },
  {
    id: 'contraste-ia-ensino-computacao',
    titulo: 'IA no ensino: mediação e aprendizagem',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '1.03.00.00-7',
  },
  {
    id: 'interdisciplinar-mobilidade-urbana',
    titulo: 'Mobilidade urbana e desigualdades de deslocamento',
    instrucao: 'Oriente perguntas para delimitar o problema de pesquisa.',
    codigoPrimario: '6.05.00.00-0',
    codigosCorrelatos: ['7.02.04.00-4'],
    observacaoInterdisciplinar: 'O problema relaciona planejamento territorial e dimensões sociais urbanas.',
  },
]

function requiredCatalogEntry(codigo: string) {
  const entry = resolveCnpqCatalogEntry(codigo)
  if (!entry) throw new Error(`Fixture D2 usa código CNPq inexistente: ${codigo}`)
  return entry
}

export function getScenarioClassification(scenario: ScientificScenario): CnpqClassification | null {
  if (!scenario.codigoPrimario) return null

  return {
    versao_catalogo: CNPQ_CATALOG_VERSION,
    primaria: requiredCatalogEntry(scenario.codigoPrimario),
    ...(scenario.codigosCorrelatos
      ? { correlatas: scenario.codigosCorrelatos.map(requiredCatalogEntry) }
      : {}),
    ...(scenario.observacaoInterdisciplinar
      ? { observacao_interdisciplinar: scenario.observacaoInterdisciplinar }
      : {}),
  }
}

export function getScenarioOwnedContext(scenario: ScientificScenario): OwnedResumoScientificContext {
  const classification = getScenarioClassification(scenario)
  const toItem = (item: NonNullable<typeof classification>['primaria']) => ({
    codigo: item.codigo,
    nome: item.nome,
    nivel: item.nivel,
    caminhoCodigos: item.caminho_codigos,
  })

  return {
    decisaoAutoralContextual: scenario.decisaoAutoral ?? null,
    classificacaoCnpqContextual: classification
      ? {
        versaoCatalogo: classification.versao_catalogo,
        primaria: toItem(classification.primaria),
        correlatas: classification.correlatas?.map(toItem) ?? [],
        ...(classification.observacao_interdisciplinar
          ? { observacaoInterdisciplinar: classification.observacao_interdisciplinar }
          : {}),
      }
      : null,
  }
}
