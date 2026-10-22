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


export type AIProviderName = 'gemini' | 'openai'

export type AIMessageRole = 'user' | 'assistant'

export interface AIMessage {
  role: AIMessageRole
  content: string
}

export interface AIGenerationOptions {
  temperature: number
  topP: number
  topK: number
  maxOutputTokens: number
}

export interface AIGenerationRequest {
  systemInstruction: string
  prompt: string
  history: AIMessage[]
  mode: 'chat' | 'single-turn'
  options: AIGenerationOptions
}

export type AIErrorCode =
  | 'RATE_LIMIT'
  | 'AUTH_ERROR'
  | 'CONTENT_BLOCKED'
  | 'NETWORK_ERROR'
  | 'PROVIDER_ERROR'
  | 'TIMEOUT'

export class AIProviderError extends Error {
  constructor(
    public readonly code: AIErrorCode,
    public readonly provider: AIProviderName,
  ) {
    super(code)
    this.name = 'AIProviderError'
  }
}
