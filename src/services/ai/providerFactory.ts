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


import { GEMINI_MODEL } from '../../config/gemini'
import type { AIProviderName } from './contracts'
import type { AIProvider } from './provider'
import { GeminiProvider } from './providers/gemini.provider'
import { OpenAIProvider } from './providers/openai.provider'
import { E2EFakeProvider } from './providers/e2eFake.provider'
import { getE2EEnvironmentIdentity } from '../../config/e2eEnvironment'

let providerInstance: AIProvider | undefined

export function getConfiguredAIProviderName(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): AIProviderName {
  const configured = environmentVariables.AI_PROVIDER?.trim().toLowerCase() || 'gemini'

  if (configured !== 'gemini' && configured !== 'openai') {
    throw new Error('AI_PROVIDER deve ser "gemini" ou "openai".')
  }

  return configured
}

export function getConfiguredAIModel(): string {
  return getConfiguredAIProviderName() === 'openai'
    ? process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna'
    : GEMINI_MODEL
}

export function getAIProvider(): AIProvider {
  // A identidade E2E validada tem precedência absoluta sobre AI_PROVIDER e sobre o cache.
  if (getE2EEnvironmentIdentity()?.supabaseProjectRef) {
    return new E2EFakeProvider()
  }
  if (!providerInstance) {
    providerInstance = getConfiguredAIProviderName() === 'openai'
      ? new OpenAIProvider()
      : new GeminiProvider()
  }

  return providerInstance
}
