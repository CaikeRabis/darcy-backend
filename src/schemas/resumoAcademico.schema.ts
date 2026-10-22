import { z } from 'zod'
import {
  CNPQ_CATALOG_VERSION,
  resolveCnpqCatalogEntry,
} from '../services/cnpqTaxonomy'

const StatusEtapaSchema = z.enum(['pendente', 'em_revisao', 'aprovado'])

const EtapaResumoSchema = z.object({
  respostas_usuario: z.record(z.string()),
  diagnostico: z.string(),
  lacunas: z.array(z.string()),
  texto_sugerido: z.string(),
  status: StatusEtapaSchema,
}).strict()

const EtapaResultadosSchema = EtapaResumoSchema.extend({
  tipo: z.string(),
}).strict()

const AvaliacaoFinalSchema = z.object({
  coerencia: z.string(),
  clareza: z.string(),
  coesao: z.string(),
  adequacao_academica: z.string(),
  problemas_identificados: z.array(z.string()),
  sugestoes: z.array(z.string()),
}).strict()

const ArtefatoOpcoesDinamicasSchema = z.object({
  input_fingerprint: z.string().min(1),
  opcoes: z.array(z.string()).min(1),
}).strict()

const ArtefatosIASchema = z.object({
  opcoes_dinamicas: z.record(ArtefatoOpcoesDinamicasSchema).optional(),
}).strict()

export const DecisaoAutoralSchema = z.object({
  id: z.literal('contexto_problema_central'),
  escolha: z.string().min(1).max(1000),
  justificativa: z.string().min(1).max(2000),
  atualizada_em: z.string().datetime(),
}).strict()

const CnpqLevelSchema = z.enum(['grande_area', 'area', 'subarea', 'especialidade'])

const CnpqCatalogEntrySchema = z.object({
  codigo: z.string().min(1),
  nivel: CnpqLevelSchema,
  nome: z.string().min(1),
  caminho_codigos: z.array(z.string().min(1)).min(1),
}).strict()

function isCanonicalCnpqEntry(entry: z.infer<typeof CnpqCatalogEntrySchema>): boolean {
  const resolved = resolveCnpqCatalogEntry(entry.codigo)

  return resolved !== null &&
    resolved.nivel === entry.nivel &&
    resolved.nome === entry.nome &&
    resolved.caminho_codigos.length === entry.caminho_codigos.length &&
    resolved.caminho_codigos.every((codigo, index) => codigo === entry.caminho_codigos[index])
}

export const ClassificacaoCnpqSchema = z.object({
  versao_catalogo: z.literal(CNPQ_CATALOG_VERSION),
  primaria: CnpqCatalogEntrySchema,
  correlatas: z.array(CnpqCatalogEntrySchema).max(8).optional(),
  observacao_interdisciplinar: z.string().trim().min(1).max(1000).optional(),
}).strict().superRefine((classificacao, context) => {
  if (!isCanonicalCnpqEntry(classificacao.primaria)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['primaria'],
      message: 'A classificação CNPq principal não corresponde ao catálogo oficial versionado.',
    })
  }

  const codigos = new Set([classificacao.primaria.codigo])
  classificacao.correlatas?.forEach((correlata, index) => {
    if (!isCanonicalCnpqEntry(correlata)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correlatas', index],
        message: 'A classificação CNPq correlata não corresponde ao catálogo oficial versionado.',
      })
    }
    if (codigos.has(correlata.codigo)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correlatas', index, 'codigo'],
        message: 'Uma classificação CNPq não pode ser repetida.',
      })
    }
    codigos.add(correlata.codigo)
  })
})

export const ResumoAcademicoStateSchema = z.object({
  titulo_provisorio: z.string(),
  tema: z.string(),
  // Default preserva a leitura de JSONBs anteriores que não tinham esse campo.
  area_conhecimento: z.string().default(''),
  // Opcional para que JSONBs criados antes da classificação estruturada continuem legíveis.
  classificacao_cnpq: ClassificacaoCnpqSchema.optional(),
  nivel_academico: z.string(),
  estagio_pesquisa: z.enum([
    'nao_iniciado',
    'em_andamento',
    'resultados_parciais',
    'concluido',
  ]),
  // Opcional para manter leitura compatível com progressos persistidos antes
  // do marcador explícito de conclusão da identificação inicial.
  identificacao_inicial_concluida: z.boolean().optional(),
  artefatos_ia: ArtefatosIASchema.optional(),
  // Opcional para leitura de progressos persistidos antes do registro autoral.
  decisoes_autorais: z.array(DecisaoAutoralSchema).max(1).optional(),
  contexto: EtapaResumoSchema,
  objetivo: EtapaResumoSchema,
  metodologia: EtapaResumoSchema,
  fundamentacao_teorica: EtapaResumoSchema,
  resultados: EtapaResultadosSchema,
  resumo_completo: z.string(),
  numero_palavras: z.number().finite(),
  limite_palavras: z.number().finite(),
  avaliacao_final: AvaliacaoFinalSchema,
}).strict()

export const ResumoAcademicoProgressRequestSchema = z.object({
  progress: ResumoAcademicoStateSchema,
}).strict()

export type ResumoAcademicoState = z.infer<typeof ResumoAcademicoStateSchema>
