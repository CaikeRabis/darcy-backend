import { describe, expect, it } from 'vitest'
import {
  EnvironmentConfigurationError,
  validateEnvironment,
} from '../../src/config/environment'
import { getE2EEnvironmentIdentity, assertE2EOperationalIdentity } from '../../src/config/e2eEnvironment'

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

function createLocalEnvironment(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    PORT: '3001',
    CORS_ORIGIN: 'http://127.0.0.1:5174',
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
    SUPABASE_PUBLISHABLE_KEY: 'local-publishable-key',
    AI_PROVIDER: 'openai',
    OPENAI_API_KEY: 'test-openai-key',
    DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED: 'enabled',
    DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'fake',
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
    environment.DARCY_ENV_FILE = '.env.e2e.local'
    environment.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = 'enabled'
    environment.DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER = 'fake'
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    environment.DARCY_ALPHA_SUPABASE_PROJECT_REF = 'alphaproject1'
    environment.SUPABASE_URL = 'https://e2eproject1.supabase.co'
    environment.DATABASE_URL = 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'
    environment.DIRECT_URL = 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'
    delete environment.OPENAI_API_KEY

    expect(() => validateEnvironment(environment)).not.toThrow()
    expect(getE2EEnvironmentIdentity(environment)).toEqual({ supabaseProjectRef: 'e2eproject1' })
  })

  it('aceita Session pooler do Supabase para runtime e operações Prisma E2E', () => {
    const environment = createValidEnvironment()
    environment.DARCY_E2E_GUARD = 'enabled'
    environment.DARCY_ENV_FILE = '.env.e2e.local'
    environment.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = 'enabled'
    environment.DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER = 'fake'
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

  it('reconhece identidade local sintaticamente coerente sem declarar prova operacional', () => {
    const environment = createLocalEnvironment()
    expect(getE2EEnvironmentIdentity(environment)).toEqual({
      supabaseProjectRef: 'darcy-e2e-c0361',
      mode: 'local',
      localStackId: 'darcy-e2e-c0361',
    })
    expect(() => assertE2EOperationalIdentity(environment)).toThrow('comprovação operacional')
  })

  it('aceita identidade local operacional somente com marcador separado', () => {
    const environment = createLocalEnvironment()
    environment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED = 'enabled'
    expect(assertE2EOperationalIdentity(environment)).toMatchObject({ mode: 'local', localStackId: 'darcy-e2e-c0361' })
  })

  it.each([
    ['DARCY_E2E_LOCAL_STACK_ID', ''],
    ['DARCY_E2E_LOCAL_STACK_ID', 'supabase'],
    ['DARCY_E2E_LOCAL_STACK_ID', 'darcy-e2e-default'],
    ['DARCY_ENV_FILE', '.env'],
    ['DARCY_E2E_LOCAL_GATEWAY_PORT', '54321'],
    ['DARCY_E2E_LOCAL_DATABASE_PORT', ''],
    ['SUPABASE_URL', 'https://darcy-e2e-c0361.supabase.co'],
    ['DATABASE_URL', 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres'],
    ['DIRECT_URL', 'postgresql://postgres:password@127.0.0.1:5432/postgres'],
  ])('rejeita configuração local inválida em %s', (name, value) => {
    const environment = createLocalEnvironment()
    environment[name] = value
    expect(() => getE2EEnvironmentIdentity(environment)).toThrow()
  })

  it('rejeita mistura entre identidade local e referência remota', () => {
    const environment = createLocalEnvironment()
    environment.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF = 'e2eproject1'
    expect(() => getE2EEnvironmentIdentity(environment)).toThrow('ambígua')
  })

  it('rejeita identidade local sem guarda ou em produção', () => {
    const withoutGuard = createLocalEnvironment()
    withoutGuard.DARCY_E2E_GUARD = 'disabled'
    expect(() => getE2EEnvironmentIdentity(withoutGuard)).toThrow('DARCY_E2E_GUARD')

    const production = createLocalEnvironment()
    production.NODE_ENV = 'production'
    expect(() => getE2EEnvironmentIdentity(production)).toThrow('não pode ser usada em produção')
  })
})
