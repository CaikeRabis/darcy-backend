import { describe, expect, it } from 'vitest'
import { getE2EEnvironmentIdentity } from '../../src/config/e2eEnvironment'
import {
  createIsolatedPrismaE2EEnvironment,
  getPrismaE2ECommand,
} from '../../src/config/prismaE2eEnvironment'

function createE2EProfile(): Record<string, string> {
  return {
    DARCY_E2E_GUARD: 'enabled',
    DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF: 'e2eproject1',
    DARCY_ALPHA_SUPABASE_PROJECT_REF: 'alphaproject1',
    DATABASE_URL: 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres',
    DIRECT_URL: 'postgresql://postgres:password@db.e2eproject1.supabase.co:5432/postgres',
    SUPABASE_URL: 'https://e2eproject1.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-publishable-key',
  }
}

describe('ambiente isolado do Prisma E2E', () => {
  it('usa exclusivamente o perfil E2E mesmo com conexões Alpha herdadas', () => {
    const environment = createIsolatedPrismaE2EEnvironment(createE2EProfile(), {
      PATH: '/usr/bin',
      DATABASE_URL: 'postgresql://alpha-inherited',
      DIRECT_URL: 'postgresql://alpha-inherited',
      SUPABASE_URL: 'https://alphaproject1.supabase.co',
    })

    expect(environment.DATABASE_URL).toContain('e2eproject1')
    expect(environment.DIRECT_URL).toContain('e2eproject1')
    expect(environment.SUPABASE_URL).toContain('e2eproject1')
    expect(getE2EEnvironmentIdentity(environment)).toEqual({ supabaseProjectRef: 'e2eproject1' })
  })

  it('bloqueia perfil sem conexão direta antes de chamar Prisma', () => {
    const profile = createE2EProfile()
    delete profile.DIRECT_URL

    expect(() => createIsolatedPrismaE2EEnvironment(profile)).toThrow('Perfil Prisma E2E incompleto')
  })

  it('não preserva variáveis de conexão herdadas que não pertençam ao perfil', () => {
    const environment = createIsolatedPrismaE2EEnvironment(createE2EProfile(), {
      PATH: '/usr/bin',
      SHADOW_DATABASE_URL: 'postgresql://alpha-inherited',
    })

    expect(environment.SHADOW_DATABASE_URL).toBeUndefined()
  })

  it('permite somente validate e migrate status sem autorização de escrita', () => {
    expect(getPrismaE2ECommand(['validate'], undefined)).toEqual(['validate'])
    expect(getPrismaE2ECommand(['migrate', 'status'], undefined)).toEqual(['migrate', 'status'])
  })

  it('bloqueia migrate deploy sem autorização explícita', () => {
    expect(() => getPrismaE2ECommand(['migrate', 'deploy'], undefined)).toThrow(
      'DARCY_E2E_MIGRATION_APPROVED=apply',
    )
    expect(getPrismaE2ECommand(['migrate', 'deploy'], 'apply')).toEqual(['migrate', 'deploy'])
  })

  it('bloqueia comandos Prisma não permitidos no ambiente E2E', () => {
    expect(() => getPrismaE2ECommand(['db', 'push'], 'apply')).toThrow('não permitido')
  })
})
