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
        }),
      },
    }))
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
