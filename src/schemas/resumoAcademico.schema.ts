import { z } from 'zod'

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

const DecisaoAutoralSchema = z.object({
  id: z.literal('contexto_problema_central'),
  escolha: z.string().min(1).max(1000),
  justificativa: z.string().min(1).max(2000),
  atualizada_em: z.string().datetime(),
}).strict()

export const ResumoAcademicoStateSchema = z.object({
  titulo_provisorio: z.string(),
  tema: z.string(),
  area_conhecimento: z.string(),
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
