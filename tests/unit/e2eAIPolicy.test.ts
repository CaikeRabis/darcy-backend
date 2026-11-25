import { describe, expect, it, vi } from 'vitest'
import { Socket } from 'node:net'
import { E2EFakeProvider } from '../../src/services/ai/providers/e2eFake.provider'
import { installE2EOutboundGuard } from '../../src/config/e2eOutboundGuard'
import { assertScientificDiagnosisProviderConfiguration } from '../../src/config/scientificDiagnosisProvider'
import { OpenAIProvider } from '../../src/services/ai/providers/openai.provider'
import { GeminiProvider } from '../../src/services/ai/providers/gemini.provider'

const env: NodeJS.ProcessEnv = {
  DARCY_ENV_FILE: '.env.e2e.local', DARCY_E2E_GUARD: 'enabled',
  DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF: 'e2eproject1',
  DARCY_ALPHA_SUPABASE_PROJECT_REF: 'alphaproject1',
  SUPABASE_URL: 'https://e2eproject1.supabase.co',
  DATABASE_URL: 'postgresql://postgres.e2eproject1@pooler.supabase.com/postgres',
  DIRECT_URL: 'postgresql://postgres.e2eproject1@pooler.supabase.com/postgres',
  DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED: 'enabled',
  DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'fake',
  CORS_ORIGIN: 'http://localhost:5174', NODE_ENV: 'test',
}

const request = (prompt: string) => ({
  systemInstruction: '', prompt, history: [], mode: 'chat' as const,
  options: { temperature: 0, topP: 0, topK: 0, maxOutputTokens: 50 },
})

describe('política E2E de IA', () => {
  it('gera opções determinísticas sem transporte externo', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
    const provider = new E2EFakeProvider()
    const prompt = "Retorne OBRIGATORIAMENTE o campo 'opcoesDinamicas'\n- ID: problema_central | Pergunta: teste"
    const result = JSON.parse(await provider.generate(request(prompt)))
    expect(result.opcoesDinamicas.problema_central).toHaveLength(4)
    expect(await provider.generate(request(prompt))).toBe(JSON.stringify(result))
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('bloqueia chat genérico e não recorre a outro provider', async () => {
    await expect(new E2EFakeProvider().generate(request('Texto livre'))).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('falha fechado se o diagnóstico não usar fake', () => {
    expect(() => assertScientificDiagnosisProviderConfiguration({ ...env, DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'configured' })).toThrow('não há fallback')
    expect(() => assertScientificDiagnosisProviderConfiguration({ ...env, DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'invalid' })).toThrow()
  })

  it('recusa instanciação direta dos dois SDKs reais no E2E', () => {
    const before = process.env
    process.env = { ...before, ...env, OPENAI_API_KEY: 'synthetic', GEMINI_API_KEY: 'synthetic' }
    try {
      expect(() => new OpenAIProvider()).toThrow('PROVIDER_ERROR')
      expect(() => new GeminiProvider()).toThrow('PROVIDER_ERROR')
    } finally {
      process.env = before
    }
  })

  it('bloqueia sockets externos antes do transporte, permitindo apenas Auth E2E e loopback', () => {
    const before = Socket.prototype.connect
    const transport = vi.fn(function (this: Socket) { return this })
    Socket.prototype.connect = transport as unknown as typeof Socket.prototype.connect
    try {
      installE2EOutboundGuard(env)
      const socket = new Socket()
      expect(() => socket.connect({ host: 'api.openai.com', port: 443 })).toThrow('bloqueada')
      expect(() => socket.connect({ host: 'generativelanguage.googleapis.com', port: 443 })).toThrow('bloqueada')
      expect(transport).not.toHaveBeenCalled()
      socket.connect({ host: 'e2eproject1.supabase.co', port: 443 })
      socket.connect({ host: '127.0.0.1', port: 3001 })
      expect(() => Reflect.apply(socket.connect, socket, [[{ host: 'api.openai.com', port: 443 }, null]])).toThrow('bloqueada')
      Reflect.apply(socket.connect, socket, [[{ host: '127.0.0.1', port: 55521 }, null]])
      expect(transport).toHaveBeenCalledTimes(3)
    } finally {
      Socket.prototype.connect = before
    }
  })
})
