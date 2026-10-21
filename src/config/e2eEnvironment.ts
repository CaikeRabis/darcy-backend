export interface E2EEnvironmentIdentity {
  supabaseProjectRef: string
}

const PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/

function getRequiredProjectRef(environmentVariables: NodeJS.ProcessEnv, name: string): string {
  const value = environmentVariables[name]?.trim().toLowerCase()

  if (!value || !PROJECT_REF_PATTERN.test(value)) {
    throw new Error(`Configuração E2E inválida: ${name} deve conter uma referência de projeto Supabase válida.`)
  }

  return value
}

function getProjectRefFromSupabaseUrl(urlValue: string): string | undefined {
  try {
    const url = new URL(urlValue)
    const match = /^([a-z0-9]{8,64})\.supabase\.co$/i.exec(url.hostname)
    return match?.[1]?.toLowerCase()
  } catch {
    return undefined
  }
}

function getProjectRefFromDatabaseUrl(urlValue: string): string | undefined {
  try {
    const url = new URL(urlValue)
    const directHostMatch = /^db\.([a-z0-9]{8,64})\.supabase\.co$/i.exec(url.hostname)

    if (directHostMatch?.[1]) {
      return directHostMatch[1].toLowerCase()
    }

    const poolerUserMatch = /^postgres\.([a-z0-9]{8,64})$/i.exec(decodeURIComponent(url.username))
    return poolerUserMatch?.[1]?.toLowerCase()
  } catch {
    return undefined
  }
}

/**
 * Confere referências efetivamente derivadas das URLs de Auth e PostgreSQL.
 * A função só é ativada quando o processo é explicitamente destinado a E2E.
 */
export function getE2EEnvironmentIdentity(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): E2EEnvironmentIdentity | undefined {
  if (environmentVariables.DARCY_E2E_GUARD !== 'enabled') {
    return undefined
  }

  const expectedProjectRef = getRequiredProjectRef(
    environmentVariables,
    'DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF',
  )
  const alphaProjectRef = getRequiredProjectRef(
    environmentVariables,
    'DARCY_ALPHA_SUPABASE_PROJECT_REF',
  )

  if (expectedProjectRef === alphaProjectRef) {
    throw new Error('Configuração E2E inválida: o projeto esperado não pode ser o projeto Alpha reservado.')
  }

  const authProjectRef = getProjectRefFromSupabaseUrl(environmentVariables.SUPABASE_URL ?? '')
  const databaseProjectRef = getProjectRefFromDatabaseUrl(environmentVariables.DATABASE_URL ?? '')
  const directDatabaseProjectRef = getProjectRefFromDatabaseUrl(environmentVariables.DIRECT_URL ?? '')

  if (!authProjectRef || !databaseProjectRef || !directDatabaseProjectRef) {
    throw new Error('Configuração E2E inválida: não foi possível comprovar a identidade de Auth, banco e conexão direta.')
  }

  if (
    authProjectRef === alphaProjectRef
    || databaseProjectRef === alphaProjectRef
    || directDatabaseProjectRef === alphaProjectRef
  ) {
    throw new Error('Configuração E2E inválida: Auth, banco ou conexão direta aponta para o projeto Alpha reservado.')
  }

  if (authProjectRef !== databaseProjectRef || authProjectRef !== directDatabaseProjectRef) {
    throw new Error('Configuração E2E inválida: Auth, banco e conexão direta pertencem a projetos Supabase distintos.')
  }

  if (authProjectRef !== expectedProjectRef) {
    throw new Error('Configuração E2E inválida: o projeto Supabase efetivo não corresponde ao esperado.')
  }

  return { supabaseProjectRef: expectedProjectRef }
}
