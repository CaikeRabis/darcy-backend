/**
 * Projeto: DARCY — Sistema Inteligente de Orientação Científica
 *
 * Autor: Caike Carvalho Rabis
 *
 * Titular dos direitos patrimoniais: Escrita com Ciência
 *
 * Copyright (c) 2026 Escrita com Ciência.
 *
 * Todos os direitos reservados.
 *
 * Consulte NOTICE.txt para informações de titularidade.
 */

import { z } from 'zod'

const DarcyCardSchema = z.object({
  id: z.string(),
  tipo: z.enum(['reflexao', 'sugestao', 'alerta', 'validacao', 'recurso']),
  titulo: z.string(),
  conteudo: z.string(),
  cta: z.string().optional(),
  prioridade: z.enum(['alta', 'media', 'baixa']),
}).strict()

const DiagnosticoSecaoSchema = z.object({
  clareza: z.number().min(0).max(100),
  coerencia: z.number().min(0).max(100),
  completude: z.number().min(0).max(100),
  pontosFortes: z.array(z.string()),
  pontosAMelhorar: z.array(z.string()),
}).strict()

/** Contrato executável equivalente ao JSON Schema de resposta usado pelo OpenAIProvider. */
export const DarcyResponseSchema = z.object({
  mensagem: z.string(),
  cards: z.array(DarcyCardSchema).optional(),
  diagnostico: DiagnosticoSecaoSchema.optional(),
  perguntasEstrategicas: z.array(z.string()).optional(),
  sugestoesReferencias: z.array(z.string()).optional(),
  opcoesDinamicas: z.record(z.array(z.string())).optional(),
}).strict()

/** JSON Schema enviado ao provedor; mantenha sincronizado com DarcyResponseSchema. */
export const DARCY_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    mensagem: { type: 'string' },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          tipo: { type: 'string', enum: ['reflexao', 'sugestao', 'alerta', 'validacao', 'recurso'] },
          titulo: { type: 'string' },
          conteudo: { type: 'string' },
          cta: { type: 'string' },
          prioridade: { type: 'string', enum: ['alta', 'media', 'baixa'] },
        },
        required: ['id', 'tipo', 'titulo', 'conteudo', 'prioridade'],
      },
    },
    diagnostico: {
      type: 'object',
      additionalProperties: false,
      properties: {
        clareza: { type: 'number', minimum: 0, maximum: 100 },
        coerencia: { type: 'number', minimum: 0, maximum: 100 },
        completude: { type: 'number', minimum: 0, maximum: 100 },
        pontosFortes: { type: 'array', items: { type: 'string' } },
        pontosAMelhorar: { type: 'array', items: { type: 'string' } },
      },
      required: ['clareza', 'coerencia', 'completude', 'pontosFortes', 'pontosAMelhorar'],
    },
    perguntasEstrategicas: { type: 'array', items: { type: 'string' } },
    sugestoesReferencias: { type: 'array', items: { type: 'string' } },
    opcoesDinamicas: {
      type: 'object',
      additionalProperties: {
        type: 'array',
        items: { type: 'string' },
      },
    },
  },
  required: ['mensagem'],
} as const

export type ExperimentResponseValidationFailure = 'invalid_json' | 'invalid_contract'

export function validateExperimentDarcyResponse(
  outputText: string,
): { ok: true } | { ok: false; reason: ExperimentResponseValidationFailure } {
  let parsed: unknown

  try {
    parsed = JSON.parse(outputText)
  } catch {
    return { ok: false, reason: 'invalid_json' }
  }

  return DarcyResponseSchema.safeParse(parsed).success
    ? { ok: true }
    : { ok: false, reason: 'invalid_contract' }
}
