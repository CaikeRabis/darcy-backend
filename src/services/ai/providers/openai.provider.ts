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
import { DARCY_RESPONSE_JSON_SCHEMA } from '../darcyResponseValidation'
import type { AIProvider } from '../provider'

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
    const result = await this.generateWithUsage(request)
    return result.outputText
  }

  /** Metadados internos para o runner experimental; não altera o contrato AIProvider. */
  async generateWithUsage(request: AIGenerationRequest): Promise<{
    outputText: string
    inputTokens: number | null
    outputTokens: number | null
  }> {
    try {
      const response = await this.createResponse(request)

      if (!response.output_text) {
        const refused = response.output.some(
          (item) => item.type === 'message' && item.content.some((content) => content.type === 'refusal'),
        )
        throw new AIProviderError(refused ? 'CONTENT_BLOCKED' : 'PROVIDER_ERROR', this.name)
      }

      return {
        outputText: response.output_text,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
      }
    } catch (error) {
      throw this.normalizeError(error)
    }
  }

  /** Resultado bruto exclusivo do runner experimental, inclusive recusas e respostas incompletas. */
  async generateForExperiment(request: AIGenerationRequest): Promise<{
    outputText: string | null
    inputTokens: number | null
    outputTokens: number | null
    completion: 'completed' | 'incomplete' | 'refused'
  }> {
    try {
      const response = await this.createResponse(request)
      const refused = response.output.some(
        (item) => item.type === 'message' && item.content.some((content) => content.type === 'refusal'),
      )

      return {
        outputText: response.output_text || null,
        inputTokens: response.usage?.input_tokens ?? null,
        outputTokens: response.usage?.output_tokens ?? null,
        completion: refused ? 'refused' : response.status === 'completed' ? 'completed' : 'incomplete',
      }
    } catch (error) {
      throw this.normalizeError(error)
    }
  }

  private async createResponse(request: AIGenerationRequest) {
    const input: ResponseInput = [
      ...request.history.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      { role: 'user', content: request.prompt },
    ]

    return this.client.responses.create({
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
          schema: DARCY_RESPONSE_JSON_SCHEMA,
        },
      },
    })
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
