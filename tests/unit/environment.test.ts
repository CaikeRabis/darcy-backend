import { describe, expect, it } from 'vitest'
import {
  EnvironmentConfigurationError,
  validateEnvironment,
} from '../../src/config/environment'
import { getE2EEnvironmentIdentity } from '../../src/config/e2eEnvironment'

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
  })

  it('aceita E2E somente quando Auth e banco derivam a referência esperada', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://e2eproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'

    expect(() => validateEnvironment(environment)).not.toThrow()
    expect(getE2EEnvironmentIdentity(environment)).toEqual({ supabaseProjectRef: 'e2eproject1' })
  })

  it('aceita Session pooler do Supabase para runtime e operações Prisma E2E', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://e2eproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres.e2eproject1:password@aws-0-test.pooler.supabase.com:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres.e2eproject1:password@aws-0-test.pooler.supabase.com:5432/postgres'

    expect(() => validateEnvironment(environment)).not.toThrow()
    expect(getE2EEnvironmentIdentity(environment)).toEqual({ supabaseProjectRef: 'e2eproject1' })
  })

  it('bloqueia E2E sem a configuração de segurança completa', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'

    expect(() => validateEnvironment(environment)).toThrow('DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF')
  })

  it('bloqueia o projeto Alpha mesmo quando ele é informado como esperado', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://alphaproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres:password@db.alphaproject1.supabase.co:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres:password@db.alphaproject1.supabase.co:5432/postgres'

    expect(() => validateEnvironment(environment)).toThrow('projeto Alpha reservado')
  })

  it('bloqueia divergência entre Auth e banco', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://e2eproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres:password@db.otherproject1.supabase.co:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'

    expect(() => validateEnvironment(environment)).toThrow('projetos Supabase distintos')
  })

  it('bloqueia backend conectado a projeto diferente do esperado', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://otherproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres:password@db.otherproject1.supabase.co:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres:password@db.otherproject1.supabase.co:5432/postgres'

    expect(() => validateEnvironment(environment)).toThrow('não corresponde ao esperado')
  })

  it('bloqueia conexão direta ausente ou divergente antes de uma migration', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://e2eproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres:password@db.otherproject1.supabase.co:5432/postgres'

    expect(() => validateEnvironment(environment)).toThrow('conexão direta')
  })
})
