import { GEMINI_MODEL } from '../../config/gemini'
import type { AIProviderName } from './contracts'
import type { AIProvider } from './provider'
import { GeminiProvider } from './providers/gemini.provider'
import { OpenAIProvider } from './providers/openai.provider'

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
  if (!providerInstance) {
    providerInstance = getConfiguredAIProviderName() === 'openai'
      ? new OpenAIProvider()
      : new GeminiProvider()
  }

  return providerInstance
}
