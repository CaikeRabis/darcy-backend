import { beforeEach, describe, expect, it, vi } from 'vitest'

const openAIState = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock('openai', () => {
  class APIConnectionError extends Error {}
  class APIConnectionTimeoutError extends Error {}
  class AuthenticationError extends Error {}
  class BadRequestError extends Error {}
  class PermissionDeniedError extends Error {}
  class RateLimitError extends Error {}

  return {
    default: class OpenAI {
      responses = { create: openAIState.create }
    },
    APIConnectionError,
    APIConnectionTimeoutError,
    AuthenticationError,
    BadRequestError,
    PermissionDeniedError,
    RateLimitError,
  }
})

import {
  APIConnectionError,
  APIConnectionTimeoutError,
  AuthenticationError,
  RateLimitError,
} from 'openai'
import { OpenAIProvider } from '../../src/services/ai/providers/openai.provider'

const request = {
  systemInstruction: 'Instrução curta de teste.',
  history: [
    { role: 'user' as const, content: 'Pergunta anterior' },
    { role: 'assistant' as const, content: 'Resposta anterior' },
  ],
  prompt: 'Mensagem atual',
  mode: 'chat' as const,
  options: {
    temperature: 0.2,
    topP: 0.8,
    topK: 40,
    maxOutputTokens: 128,
  },
}

describe('OpenAIProvider com SDK mockado', () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'chave-fake-exclusiva-de-teste'
    process.env.OPENAI_MODEL = 'modelo-openai-de-teste'
    openAIState.create.mockReset()
  })

  it('usa Responses API stateless e envia a mensagem atual uma única vez', async () => {
    openAIState.create.mockResolvedValue({
      output_text: '{"mensagem":"ok"}',
      output: [],
    })
    const provider = new OpenAIProvider()

    await expect(provider.generate(request)).resolves.toBe('{"mensagem":"ok"}')
    expect(openAIState.create).toHaveBeenCalledOnce()
    expect(openAIState.create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'modelo-openai-de-teste',
      instructions: request.systemInstruction,
      store: false,
      input: [
        { role: 'user', content: 'Pergunta anterior' },
        { role: 'assistant', content: 'Resposta anterior' },
        { role: 'user', content: 'Mensagem atual' },
      ],
      text: {
        format: expect.objectContaining({
          type: 'json_schema',
          name: 'darcy_response',
          strict: false,
        }),
      },
    }))
    const providerRequest = openAIState.create.mock.calls[0]?.[0] as Record<string, unknown>
    expect(providerRequest).not.toHaveProperty('top_p')
    expect(providerRequest).not.toHaveProperty('top_k')
  })

  it('expõe conclusão e usage ao runner sem alterar generate()', async () => {
    openAIState.create.mockResolvedValue({
      status: 'completed', output_text: '{"mensagem":"ok"}', output: [], usage: { input_tokens: 12, output_tokens: 7 },
    })
    const provider = new OpenAIProvider()

    await expect(provider.generateForExperiment(request)).resolves.toEqual({
      outputText: '{"mensagem":"ok"}', inputTokens: 12, outputTokens: 7, completion: 'completed',
    })
  })

  it('expõe resposta incompleta ao runner em vez de aceitá-la como concluída', async () => {
    openAIState.create.mockResolvedValue({
      status: 'incomplete', output_text: '', output: [], usage: { input_tokens: 12, output_tokens: 7 },
    })
    const provider = new OpenAIProvider()

    await expect(provider.generateForExperiment(request)).resolves.toMatchObject({
      outputText: null, completion: 'incomplete', inputTokens: 12, outputTokens: 7,
    })
  })

  it('expõe recusa ao runner em vez de classificá-la como resposta concluída', async () => {
    openAIState.create.mockResolvedValue({
      status: 'completed',
      output_text: '',
      output: [{ type: 'message', content: [{ type: 'refusal' }] }],
      usage: { input_tokens: 12, output_tokens: 7 },
    })
    const provider = new OpenAIProvider()

    await expect(provider.generateForExperiment(request)).resolves.toMatchObject({
      outputText: null, completion: 'refused', inputTokens: 12, outputTokens: 7,
    })
  })

  it.each([
    [new RateLimitError(429, {}, 'rate limit de teste', new Headers()), 'RATE_LIMIT'],
    [new AuthenticationError(401, {}, 'autenticação de teste', new Headers()), 'AUTH_ERROR'],
    [new APIConnectionTimeoutError(), 'TIMEOUT'],
    [new APIConnectionError({ message: 'rede indisponível no teste' }), 'NETWORK_ERROR'],
  ] as const)('normaliza erro do SDK para %s', async (sdkError, expectedCode) => {
    openAIState.create.mockRejectedValue(sdkError)
    const provider = new OpenAIProvider()

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: expectedCode,
      provider: 'openai',
    })
  })

  it('normaliza ausência de output_text sem registrar conteúdo', async () => {
    openAIState.create.mockResolvedValue({ output_text: '', output: [] })
    const provider = new OpenAIProvider()

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'PROVIDER_ERROR',
      provider: 'openai',
    })
  })
})
