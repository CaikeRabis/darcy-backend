import { describe, expect, it, vi } from 'vitest'
import {
  assertScientificDiagnosisProviderConfiguration,
  getScientificDiagnosisProviderMode,
} from '../../src/config/scientificDiagnosisProvider'
import { ScientificDiagnosisFakeGenerator } from '../../src/services/ScientificDiagnosisFakeGenerator'
import { createScientificDiagnosisGenerator } from '../../src/services/ScientificDiagnosisService'
import { ScientificDiagnosisProviderResponseSchema } from '../../src/schemas/scientificDiagnosis.schema'

const e2eEnvironment: NodeJS.ProcessEnv = {
  DARCY_ENV_FILE: '.env.e2e.local',
  DARCY_E2E_GUARD: 'enabled',
  DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF: 'e2eproject01',
  DARCY_ALPHA_SUPABASE_PROJECT_REF: 'alphaproject01',
  SUPABASE_URL: 'https://e2eproject01.supabase.co',
  DATABASE_URL: 'postgresql://postgres.e2eproject01@localhost/postgres',
  DIRECT_URL: 'postgresql://postgres.e2eproject01@localhost/postgres',
  CORS_ORIGIN: 'http://localhost:5174',
  NODE_ENV: 'test',
  DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED: 'enabled',
  DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'fake',
}

const localE2EEnvironment: NodeJS.ProcessEnv = {
  DARCY_ENV_FILE: '.env.e2e.local',
  DARCY_E2E_GUARD: 'enabled',
  DARCY_E2E_LOCAL_STACK_ID: 'darcy-e2e-c0361',
  DARCY_E2E_LOCAL_GATEWAY_PORT: '55421',
  DARCY_E2E_LOCAL_DATABASE_PORT: '55422',
  DARCY_E2E_LOCAL_DIRECT_PORT: '55422',
  DARCY_ALPHA_SUPABASE_PROJECT_REF: 'alphaproject1',
  SUPABASE_URL: 'http://127.0.0.1:55421',
  DATABASE_URL: 'postgresql://postgres:password@127.0.0.1:55422/postgres',
  DIRECT_URL: 'postgresql://postgres:password@127.0.0.1:55422/postgres',
  CORS_ORIGIN: 'http://127.0.0.1:5174',
  NODE_ENV: 'test',
  DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED: 'enabled',
  DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'fake',
}

function fakeRequest(prompt: string) {
  return {
    systemInstruction: '', prompt, history: [], mode: 'single-turn' as const,
    options: { temperature: 0, topP: 0, topK: 0, maxOutputTokens: 10 },
  }
}

describe('provider científico fake', () => {
  it('é determinístico e não precisa de credenciais', async () => {
    const generator = new ScientificDiagnosisFakeGenerator()
    const prompt = '{"evidenceId":"problema","state":"ausente","value":null}'
    await expect(generator.generate(fakeRequest(prompt))).resolves.toEqual(
      await generator.generate(fakeRequest(prompt)),
    )
  })

  it('produz resposta aceita pelo schema do provider', async () => {
    const result = await new ScientificDiagnosisFakeGenerator().generate(fakeRequest(
      '{"evidenceId":"problema","state":"ausente","value":null}',
    ))
    expect(result.ok).toBe(true)
    if (result.ok) expect(ScientificDiagnosisProviderResponseSchema.safeParse(JSON.parse(result.data)).success).toBe(true)
  })

  it('não chama AIService ou rede', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    await new ScientificDiagnosisFakeGenerator().generate(fakeRequest(''))
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('injeta o fake somente no serviço científico', () => {
    const generator = createScientificDiagnosisGenerator(e2eEnvironment)
    expect(generator).toBeInstanceOf(ScientificDiagnosisFakeGenerator)
  })

  it('exige todas as guardas antes de selecionar fake', () => {
    expect(getScientificDiagnosisProviderMode({})).toBe('configured')
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...e2eEnvironment,
      DARCY_E2E_GUARD: 'disabled',
    })).toThrow(/DARCY_E2E_GUARD/)
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...e2eEnvironment,
      NODE_ENV: 'production',
    })).toThrow(/produção/)
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...e2eEnvironment,
      CORS_ORIGIN: 'https://darcy.app.br',
    })).toThrow(/loopback/)
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...e2eEnvironment,
      DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF: 'alphaproject01',
    })).toThrow(/Alpha reservado/)
  })

  it('não faz fallback silencioso quando a seleção é inválida', () => {
    expect(() => getScientificDiagnosisProviderMode({ DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'unknown' })).toThrow()
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...e2eEnvironment,
      DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED: 'disabled',
    })).toThrow(/SCIENTIFIC_DIAGNOSIS_ENABLED/)
  })

  it('bloqueia provider fake local sem prova operacional', () => {
    expect(() => assertScientificDiagnosisProviderConfiguration(localE2EEnvironment)).toThrow('comprovação operacional')
  })

  it('permite provider fake local somente com prova operacional', () => {
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...localE2EEnvironment,
      DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED: 'enabled',
    })).not.toThrow()
  })

  it('recusa provider configurado em stack local sem fallback para IA real', () => {
    expect(() => assertScientificDiagnosisProviderConfiguration({
      ...localE2EEnvironment,
      DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'configured',
    })).toThrow('não há fallback para IA real')
  })
})
