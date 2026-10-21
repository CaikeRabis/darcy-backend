export const PRISMA_E2E_REQUIRED_VARIABLES = [
  'DARCY_E2E_GUARD',
  'DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF',
  'DARCY_ALPHA_SUPABASE_PROJECT_REF',
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
] as const

type PrismaE2EVariable = typeof PRISMA_E2E_REQUIRED_VARIABLES[number]

export type PrismaE2EProfile = Record<PrismaE2EVariable, string>

export type PrismaE2ECommand = ['validate'] | ['migrate', 'status'] | ['migrate', 'deploy']

export function createIsolatedPrismaE2EEnvironment(
  profile: Record<string, string | undefined>,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const missing = PRISMA_E2E_REQUIRED_VARIABLES.filter((name) => !profile[name]?.trim())

  if (missing.length > 0) {
    throw new Error('Perfil Prisma E2E incompleto.')
  }

  if (profile.DARCY_E2E_GUARD !== 'enabled') {
    throw new Error('Perfil Prisma E2E inválido: DARCY_E2E_GUARD deve ser enabled.')
  }

  const isolatedEnvironment: NodeJS.ProcessEnv = {
    PATH: inheritedEnvironment.PATH,
  }

  for (const name of PRISMA_E2E_REQUIRED_VARIABLES) {
    isolatedEnvironment[name] = profile[name]
  }

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

  throw new Error('Comando Prisma E2E não permitido.')
}
