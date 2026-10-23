import { describe, expect, it } from 'vitest'
import {
  assertResumoHistoryE2EBackendIdentity,
  createIsolatedResumoHistoryE2EEnvironment,
} from '../../src/config/resumoHistoryE2eEnvironment'

function createProfile(): Record<string, string> {
  return {
    DARCY_E2E_GUARD: 'enabled',
    DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF: 'e2eproject1',
    DARCY_ALPHA_SUPABASE_PROJECT_REF: 'alphaproject1',
    DATABASE_URL: 'postgresql://db.e2eproject1.supabase.co:5432/postgres',
    DIRECT_URL: 'postgresql://db.e2eproject1.supabase.co:5432/postgres',
    SUPABASE_URL: 'https://e2eproject1.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    DARCY_E2E_USER_A_EMAIL: 'user-a@example.test',
    DARCY_E2E_USER_A_PASSWORD: 'password-a',
    DARCY_E2E_USER_B_EMAIL: 'user-b@example.test',
    DARCY_E2E_USER_B_PASSWORD: 'password-b',
    PORT: '3001',
  }
}

describe('ambiente E2E do histórico do Resumo Acadêmico', () => {
  it('descarta variáveis herdadas e preserva somente o perfil E2E necessário', () => {
    const result = createIsolatedResumoHistoryE2EEnvironment(createProfile(), {
      PATH: '/usr/bin',
      DATABASE_URL: 'postgresql://alpha-inherited',
      OPENAI_API_KEY: 'should-not-leak',
      DARCY_E2E_USER_A_PASSWORD: 'alpha-inherited-password',
    })

    expect(result.environment.DATABASE_URL).toContain('e2eproject1')
    expect(result.environment.DARCY_E2E_USER_A_PASSWORD).toBe('password-a')
    expect(result.environment.OPENAI_API_KEY).toBeUndefined()
    expect(result.apiBaseUrl).toBe('http://127.0.0.1:3001')
  })

  it('bloqueia credenciais dedicadas ausentes antes de acessar o backend', () => {
    const profile = createProfile()
    delete profile.DARCY_E2E_USER_B_PASSWORD

    expect(() => createIsolatedResumoHistoryE2EEnvironment(profile)).toThrow('Perfil E2E de histórico incompleto')
  })

  it('bloqueia endpoint remoto ou com credenciais na URL', () => {
    const profile = createProfile()
    profile.DARCY_E2E_API_BASE_URL = 'https://remote.example.test'
    expect(() => createIsolatedResumoHistoryE2EEnvironment(profile)).toThrow('backend local E2E')

    profile.DARCY_E2E_API_BASE_URL = 'http://user:password@127.0.0.1:3001'
    expect(() => createIsolatedResumoHistoryE2EEnvironment(profile)).toThrow('backend local E2E')
  })

  it('aceita somente health que comprova a mesma identidade E2E', () => {
    const environment = createIsolatedResumoHistoryE2EEnvironment(createProfile()).environment
    const payload = { ok: true, data: { status: 'alive', e2eEnvironment: { supabaseProjectRef: 'e2eproject1' } } }

    expect(() => assertResumoHistoryE2EBackendIdentity(payload, environment)).not.toThrow()
  })

  it('bloqueia health sem identidade, Alpha ou backend divergente', () => {
    const environment = createIsolatedResumoHistoryE2EEnvironment(createProfile()).environment

    expect(() => assertResumoHistoryE2EBackendIdentity({ ok: true, data: { status: 'alive' } }, environment)).toThrow('Não foi possível confirmar')
    expect(() => assertResumoHistoryE2EBackendIdentity({
      ok: true,
      data: { status: 'alive', e2eEnvironment: { supabaseProjectRef: 'alphaproject1' } },
    }, environment)).toThrow('backend local não corresponde')
    expect(() => assertResumoHistoryE2EBackendIdentity({
      ok: true,
      data: { status: 'alive', e2eEnvironment: { supabaseProjectRef: 'otherproject1' } },
    }, environment)).toThrow('backend local não corresponde')
  })
})
