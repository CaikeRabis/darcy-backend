import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/services/ai/providers/openai.provider', () => ({
  OpenAIProvider: class {
    readonly name = 'openai'
    readonly model = 'openai-fake'
    async generate(): Promise<string> { return '{"mensagem":"openai"}' }
  },
}))

vi.mock('../../src/services/ai/providers/gemini.provider', () => ({
  GeminiProvider: class {
    readonly name = 'gemini'
    readonly model = 'gemini-fake'
    async generate(): Promise<string> { return '{"mensagem":"gemini"}' }
  },
}))

const originalEnv = { ...process.env }

describe('providerFactory sem consumo de API', () => {
  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.AI_PROVIDER
    delete process.env.OPENAI_MODEL
    delete process.env.GEMINI_MODEL
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('mantém Gemini como fallback quando AI_PROVIDER não está definido', async () => {
    const factory = await import('../../src/services/ai/providerFactory')

    expect(factory.getConfiguredAIProviderName()).toBe('gemini')
    expect(factory.getAIProvider().name).toBe('gemini')
  })

  it('seleciona OpenAI somente por AI_PROVIDER=openai', async () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_MODEL = 'modelo-openai-de-teste'
    const factory = await import('../../src/services/ai/providerFactory')

    expect(factory.getConfiguredAIProviderName()).toBe('openai')
    expect(factory.getConfiguredAIModel()).toBe('modelo-openai-de-teste')
    expect(factory.getAIProvider().name).toBe('openai')
  })

  it('seleciona Gemini por AI_PROVIDER=gemini', async () => {
    process.env.AI_PROVIDER = 'gemini'
    process.env.GEMINI_MODEL = 'modelo-gemini-de-teste'
    const factory = await import('../../src/services/ai/providerFactory')

    expect(factory.getConfiguredAIProviderName()).toBe('gemini')
    expect(factory.getConfiguredAIModel()).toBe('modelo-gemini-de-teste')
    expect(factory.getAIProvider().name).toBe('gemini')
  })

  it('rejeita provider desconhecido sem tentar inicializar SDK', async () => {
    process.env.AI_PROVIDER = 'desconhecido'
    const factory = await import('../../src/services/ai/providerFactory')

    expect(() => factory.getConfiguredAIProviderName()).toThrow(
      'AI_PROVIDER deve ser "gemini" ou "openai".',
    )
  })
})
