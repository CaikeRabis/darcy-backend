/**
 * Projeto: DARCY — Sistema Inteligente de Orientação Científica
 *
 * Autor: Caike Carvalho Rabis
 *
 * Titular dos direitos patrimoniais: Escrita com Ciência
 *
 * Copyright (c) 2026 Escrita com Ciência.
 *
 * Todos os direitos reservados.
 *
 * Consulte NOTICE.txt para informações de titularidade.
 */


import { assertE2EOperationalIdentity } from './e2eEnvironment'

export const PRISMA_E2E_COMMON_VARIABLES = [
  'DARCY_E2E_GUARD',
  'DARCY_ALPHA_SUPABASE_PROJECT_REF',
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
] as const

export const PRISMA_E2E_REMOTE_VARIABLES = ['DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF'] as const
/** Alias compatível para consumidores que ainda validam o perfil remoto legado. */
export const PRISMA_E2E_REQUIRED_VARIABLES = [
  ...PRISMA_E2E_COMMON_VARIABLES,
  ...PRISMA_E2E_REMOTE_VARIABLES,
] as const
export const PRISMA_E2E_LOCAL_VARIABLES = [
  'DARCY_E2E_LOCAL_STACK_ID',
  'DARCY_E2E_LOCAL_GATEWAY_PORT',
  'DARCY_E2E_LOCAL_DATABASE_PORT',
  'DARCY_E2E_LOCAL_DIRECT_PORT',
] as const

type PrismaE2EVariable =
  | typeof PRISMA_E2E_COMMON_VARIABLES[number]
  | typeof PRISMA_E2E_REMOTE_VARIABLES[number]
  | typeof PRISMA_E2E_LOCAL_VARIABLES[number]

export type PrismaE2EProfile = Record<PrismaE2EVariable, string>

export type PrismaE2ECommand = ['validate'] | ['migrate', 'status'] | ['migrate', 'deploy'] | ['migrate', 'resolve', '--rolled-back', string]

export function createIsolatedPrismaE2EEnvironment(
  profile: Record<string, string | undefined>,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const local = Boolean(profile.DARCY_E2E_LOCAL_STACK_ID?.trim())
  const requiredVariables: readonly PrismaE2EVariable[] = [
    ...PRISMA_E2E_COMMON_VARIABLES,
    ...(local ? PRISMA_E2E_LOCAL_VARIABLES : PRISMA_E2E_REMOTE_VARIABLES),
  ]
  const missing = requiredVariables.filter((name) => !profile[name]?.trim())

  if (missing.length > 0) {
    throw new Error('Perfil Prisma E2E incompleto.')
  }

  if (profile.DARCY_E2E_GUARD !== 'enabled') {
    throw new Error('Perfil Prisma E2E inválido: DARCY_E2E_GUARD deve ser enabled.')
  }

  const isolatedEnvironment: NodeJS.ProcessEnv = {
    PATH: inheritedEnvironment.PATH,
  }

  if (local) isolatedEnvironment.DARCY_ENV_FILE = '.env.e2e.local'

  for (const name of requiredVariables) {
    isolatedEnvironment[name] = profile[name]
  }
  if (inheritedEnvironment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED === 'enabled') {
    isolatedEnvironment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED = 'enabled'
  }

  assertE2EOperationalIdentity(isolatedEnvironment)

  return isolatedEnvironment
}

export function getPrismaE2ECommand(
  argumentsList: readonly string[],
  migrationApproval: string | undefined,
): PrismaE2ECommand {
  if (argumentsList.length === 1 && argumentsList[0] === 'validate') {
    return ['validate']
  }

  if (argumentsList.length === 2 && argumentsList[0] === 'migrate' && argumentsList[1] === 'status') {
    return ['migrate', 'status']
  }

  if (argumentsList.length === 2 && argumentsList[0] === 'migrate' && argumentsList[1] === 'deploy') {
    if (migrationApproval !== 'apply') {
      throw new Error('Migration E2E exige DARCY_E2E_MIGRATION_APPROVED=apply.')
    }

    return ['migrate', 'deploy']
  }

  if (argumentsList.length === 4 && argumentsList[0] === 'migrate' && argumentsList[1] === 'resolve' && argumentsList[2] === '--rolled-back') {
    if (migrationApproval !== 'recover') {
      throw new Error('A recuperação de migration E2E exige DARCY_E2E_MIGRATION_APPROVED=recover.')
    }
    if (!/^20[0-9]{12}_[a-z0-9_]+$/.test(argumentsList[3])) {
      throw new Error('A migration de recuperação E2E é inválida.')
    }
    return ['migrate', 'resolve', '--rolled-back', argumentsList[3]]
  }

  throw new Error('Comando Prisma E2E não permitido.')
}
