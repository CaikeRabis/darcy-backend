import { describe, expect, it } from 'vitest'
import {
  EnvironmentConfigurationError,
  validateEnvironment,
} from '../../src/config/environment'

function createValidEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3001',
    CORS_ORIGIN: 'http://localhost:5174',
    DATABASE_URL: 'postgresql://user:password@localhost:5432/darcy',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-openai-key',
  }
}

describe('validação de ambiente', () => {
  it('aceita a configuração mínima válida de runtime', () => {
    expect(() => validateEnvironment(createValidEnvironment())).not.toThrow()
  })

  it('rejeita uma dependência crítica ausente sem expor valores', () => {
    const environment = createValidEnvironment()
    environment.DATABASE_URL = ''

    expect(() => validateEnvironment(environment)).toThrow(EnvironmentConfigurationError)
    expect(() => validateEnvironment(environment)).toThrow('DATABASE_URL')
  })

  it('exige a chave correspondente ao provider selecionado', () => {
    const environment = createValidEnvironment()
    environment.AI_PROVIDER = 'gemini'
    environment.GEMINI_API_KEY = ''
    delete environment.OPENAI_API_KEY

    expect(() => validateEnvironment(environment)).toThrow('GEMINI_API_KEY')
  })

  it('rejeita porta inválida e origem de produção fora do domínio oficial', () => {
    const invalidPort = createValidEnvironment()
    invalidPort.PORT = 'invalid'
    expect(() => validateEnvironment(invalidPort)).toThrow('PORT')

    const invalidProductionCors = createValidEnvironment()
    invalidProductionCors.NODE_ENV = 'production'
    invalidProductionCors.CORS_ORIGIN = 'https://outro-dominio.example'
    expect(() => validateEnvironment(invalidProductionCors)).toThrow('CORS_ORIGIN')

    const validTransitionCors = createValidEnvironment()
    validTransitionCors.NODE_ENV = 'production'
    validTransitionCors.CORS_ORIGIN = 'https://app.darcy.app.br,https://darcy.app.br'
    expect(() => validateEnvironment(validTransitionCors)).not.toThrow()
  })
})
