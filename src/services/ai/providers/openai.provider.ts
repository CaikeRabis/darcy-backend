import OpenAI, {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai'
import type { ResponseInput } from 'openai/resources/responses/responses'

import {
  AIProviderError,
  type AIGenerationRequest,
} from '../contracts'
import type { AIProvider } from '../provider'

const DARCY_RESPONSE_SCHEMA = {
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

export class OpenAIProvider implements AIProvider {
  public readonly name = 'openai' as const
  public readonly model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna'
  private readonly client: OpenAI

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY?.trim()

    if (!apiKey) {
      throw new AIProviderError('AUTH_ERROR', this.name)
    }

    this.client = new OpenAI({ apiKey })
  }

  async generate(request: AIGenerationRequest): Promise<string> {
    try {
      const input: ResponseInput = [
        ...request.history.map((message) => ({
          role: message.role,
          content: message.content,
        })),
        { role: 'user', content: request.prompt },
      ]

      const response = await this.client.responses.create({
        model: this.model,
        instructions: request.systemInstruction,
        input,
        store: false,
        reasoning: { effort: 'none' },
        max_output_tokens: request.options.maxOutputTokens,
        temperature: request.options.temperature,
        text: {
          format: {
            type: 'json_schema',
            name: 'darcy_response',
            description: 'Resposta estruturada do orientador acadêmico DARCY.',
            strict: false,
            schema: DARCY_RESPONSE_SCHEMA,
          },
        },
      })

      if (!response.output_text) {
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((content) => content.type === 'refusal'),
        )
        throw new AIProviderError(refused ? 'CONTENT_BLOCKED' : 'PROVIDER_ERROR', this.name)
      }

      return response.output_text
    } catch (error) {
      throw this.normalizeError(error)
    }
  }

  private normalizeError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error
    if (error instanceof RateLimitError) return new AIProviderError('RATE_LIMIT', this.name)
    if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
      return new AIProviderError('AUTH_ERROR', this.name)
    }
    if (error instanceof APIConnectionTimeoutError) return new AIProviderError('TIMEOUT', this.name)
    if (error instanceof APIConnectionError) return new AIProviderError('NETWORK_ERROR', this.name)
    if (error instanceof BadRequestError) {
      const message = error.message.toLowerCase()
      if (message.includes('content') || message.includes('safety') || message.includes('blocked')) {
        return new AIProviderError('CONTENT_BLOCKED', this.name)
      }
    }

    return new AIProviderError('PROVIDER_ERROR', this.name)
  }
}
