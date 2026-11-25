import { z } from 'zod'

export const ScientificDiagnosisCategorySchema = z.enum([
  'informacao_insuficiente',
  'alinhamento',
  'tensao',
  'contradicao',
])

export const ScientificElementSchema = z.enum([
  'problema',
  'objetivo_geral',
  'metodologia',
])

export const ScientificEvidenceStateSchema = z.enum([
  'confirmado',
  'rascunho_persistido',
  'ausente',
  'invalido',
])

/** Resposta mínima que o provider pode produzir: referências, nunca evidências livres. */
export const ScientificDiagnosisProviderResponseSchema = z.object({
  findings: z.array(z.object({
    category: ScientificDiagnosisCategorySchema,
    elements: z.array(ScientificElementSchema).min(1).max(3),
    evidenceIds: z.array(z.string().min(1).max(40)).min(1).max(6),
    explanation: z.string().trim().min(1).max(2_000),
    guidingQuestion: z.string().trim().min(1).max(1_000),
    methodologicalAlternatives: z.array(z.string().trim().min(1).max(500)).max(3).optional(),
  }).strict()).max(8),
}).strict()

export type ScientificDiagnosisProviderResponse = z.infer<typeof ScientificDiagnosisProviderResponseSchema>

export const ScientificDiagnosisEvidenceSchema = z.object({
  id: z.string().min(1).max(40),
  state: ScientificEvidenceStateSchema,
  origin: z.string().min(1).max(80),
  excerpt: z.string().max(4_000).nullable(),
}).strict()

export const ScientificDiagnosisFindingSchema = z.object({
  category: ScientificDiagnosisCategorySchema,
  elements: z.array(ScientificElementSchema).min(1).max(3),
  evidence: z.array(ScientificDiagnosisEvidenceSchema).min(1).max(6),
  explanation: z.string().trim().min(1).max(2_000),
  guidingQuestion: z.string().trim().min(1).max(1_000),
  methodologicalAlternatives: z.array(z.string().trim().min(1).max(500)).max(3).optional(),
}).strict()

export const ScientificDiagnosisSchema = z.object({
  projectId: z.string().min(1).max(100),
  analyzedRevision: z.number().int().nonnegative(),
  findings: z.array(ScientificDiagnosisFindingSchema).max(8),
  // Dados produzidos pelo servidor. Opcionais apenas para diagnósticos anteriores à F03.
  analyzedEvidence: z.array(z.object({
    id: ScientificElementSchema,
    state: ScientificEvidenceStateSchema,
    origin: z.string().min(1).max(80),
    value: z.string().max(150_000).nullable(),
  }).strict()).length(3).optional(),
  analyzedContentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  reviewState: z.enum(['formal_milestone', 'working_draft']).optional(),
  associatedVersionScope: z.string().min(1).max(100).nullable().optional(),
  diagnosisId: z.string().min(1).max(120).optional(),
  textVersionId: z.string().min(1).max(120).nullable().optional(),
  createdAt: z.string().datetime({ offset: true }).optional(),
}).strict()

export type ScientificDiagnosis = z.infer<typeof ScientificDiagnosisSchema>

/** Schema enviado ao Responses API para a operação científica, distinto do chat legado. */
export const SCIENTIFIC_DIAGNOSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['informacao_insuficiente', 'alinhamento', 'tensao', 'contradicao'] },
          elements: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', enum: ['problema', 'objetivo_geral', 'metodologia'] } },
          evidenceIds: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'string', minLength: 1, maxLength: 40 } },
          explanation: { type: 'string', minLength: 1, maxLength: 2_000 },
          guidingQuestion: { type: 'string', minLength: 1, maxLength: 1_000 },
          methodologicalAlternatives: { type: 'array', maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 500 } },
        },
        required: ['category', 'elements', 'evidenceIds', 'explanation', 'guidingQuestion', 'methodologicalAlternatives'],
      },
    },
  },
  required: ['findings'],
} as const
