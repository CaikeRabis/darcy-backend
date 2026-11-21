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


export interface E2EEnvironmentIdentity {
  /** Compatibilidade com o health check remoto existente. */
  supabaseProjectRef: string
  mode?: 'remote' | 'local'
  localStackId?: string
}

const PROJECT_REF_PATTERN = /^[a-z0-9]{8,64}$/
const LOCAL_STACK_ID_PATTERN = /^darcy-e2e-[a-z0-9][a-z0-9-]{2,63}$/
const GENERIC_LOCAL_STACK_IDS = new Set([
  'darcy-e2e-local',
  'darcy-e2e-default',
  'darcy-e2e-stack',
  'darcy-e2e-supabase',
])
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])
const LOCAL_PORT_VARIABLES = [
  'DARCY_E2E_LOCAL_GATEWAY_PORT',
  'DARCY_E2E_LOCAL_DATABASE_PORT',
  'DARCY_E2E_LOCAL_DIRECT_PORT',
] as const

function getRequiredProjectRef(environmentVariables: NodeJS.ProcessEnv, name: string): string {
  const value = environmentVariables[name]?.trim().toLowerCase()

  if (!value || !PROJECT_REF_PATTERN.test(value)) {
    throw new Error(`Configuração E2E inválida: ${name} deve conter uma referência de projeto Supabase válida.`)
  }

  return value
}

function getRequiredLocalStackId(environmentVariables: NodeJS.ProcessEnv): string {
  const value = environmentVariables.DARCY_E2E_LOCAL_STACK_ID?.trim().toLowerCase()

  if (!value || !LOCAL_STACK_ID_PATTERN.test(value) || GENERIC_LOCAL_STACK_IDS.has(value)) {
    throw new Error('Configuração E2E local inválida: DARCY_E2E_LOCAL_STACK_ID deve identificar uma stack DARCY dedicada.')
  }

  return value
}

function getRequiredLocalPort(environmentVariables: NodeJS.ProcessEnv, name: string): number {
  const value = environmentVariables[name]?.trim()
  const port = Number(value)

  if (!value || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Configuração E2E local inválida: ${name} deve conter uma porta explícita.`)
  }

  return port
}

function assertLocalHttpUrl(environmentVariables: NodeJS.ProcessEnv, name: string, expectedPort: number): void {
  let url: URL
  try {
    url = new URL(environmentVariables[name] ?? '')
  } catch {
    throw new Error(`Configuração E2E local inválida: ${name} não é uma URL válida.`)
  }

  if (
    url.protocol !== 'http:' ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.port !== String(expectedPort) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`Configuração E2E local inválida: ${name} deve apontar para o gateway loopback esperado.`)
  }
}

function assertLocalDatabaseUrl(environmentVariables: NodeJS.ProcessEnv, name: string, expectedPort: number): void {
  let url: URL
  try {
    url = new URL(environmentVariables[name] ?? '')
  } catch {
    throw new Error(`Configuração E2E local inválida: ${name} não é uma URL válida.`)
  }

  if (
    (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.port !== String(expectedPort) ||
    !url.pathname ||
    url.pathname === '/'
  ) {
    throw new Error(`Configuração E2E local inválida: ${name} deve apontar para PostgreSQL loopback na porta esperada.`)
  }
}

function getLocalIdentity(environmentVariables: NodeJS.ProcessEnv): E2EEnvironmentIdentity {
  if (environmentVariables.DARCY_ENV_FILE !== '.env.e2e.local') {
    throw new Error('Configuração E2E local exige DARCY_ENV_FILE=.env.e2e.local.')
  }
  if (environmentVariables.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new Error('Configuração E2E local não pode ser usada em produção.')
  }

  const localStackId = getRequiredLocalStackId(environmentVariables)
  const alphaProjectRef = getRequiredProjectRef(environmentVariables, 'DARCY_ALPHA_SUPABASE_PROJECT_REF')

  if (environmentVariables.DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF?.trim()) {
    throw new Error('Configuração E2E ambígua: stack local não pode declarar referência remota esperada.')
  }

  const gatewayPort = getRequiredLocalPort(environmentVariables, LOCAL_PORT_VARIABLES[0])
  const databasePort = getRequiredLocalPort(environmentVariables, LOCAL_PORT_VARIABLES[1])
  const directPort = getRequiredLocalPort(environmentVariables, LOCAL_PORT_VARIABLES[2])

  assertLocalHttpUrl(environmentVariables, 'SUPABASE_URL', gatewayPort)
  assertLocalDatabaseUrl(environmentVariables, 'DATABASE_URL', databasePort)
  assertLocalDatabaseUrl(environmentVariables, 'DIRECT_URL', directPort)

  if (localStackId === alphaProjectRef) {
    throw new Error('Configuração E2E inválida: a stack local não pode coincidir com a identidade Alpha reservada.')
  }

  return { supabaseProjectRef: localStackId, mode: 'local', localStackId }
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

    if (directHostMatch?.[1]) return directHostMatch[1].toLowerCase()

    const poolerUserMatch = /^postgres\.([a-z0-9]{8,64})$/i.exec(decodeURIComponent(url.username))
    return poolerUserMatch?.[1]?.toLowerCase()
  } catch {
    return undefined
  }
}

function getRemoteIdentity(environmentVariables: NodeJS.ProcessEnv): E2EEnvironmentIdentity {
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
    authProjectRef === alphaProjectRef ||
    databaseProjectRef === alphaProjectRef ||
    directDatabaseProjectRef === alphaProjectRef
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

/**
 * Valida a identidade declarada. Para uma stack local, isso é somente
 * validação sintática e de coerência; não constitui prova de propriedade dos
 * containers. Essa prova é exigida separadamente antes de operações reais.
 */
export function getE2EEnvironmentIdentity(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): E2EEnvironmentIdentity | undefined {
  const localStackId = environmentVariables.DARCY_E2E_LOCAL_STACK_ID?.trim()

  if (environmentVariables.DARCY_E2E_GUARD !== 'enabled') {
    if (localStackId) throw new Error('Configuração E2E local exige DARCY_E2E_GUARD=enabled.')
    return undefined
  }

  return localStackId ? getLocalIdentity(environmentVariables) : getRemoteIdentity(environmentVariables)
}

/** Bloqueia uso operacional de uma identidade local sem prova externa dos containers autorizados. */
export function assertE2EOperationalIdentity(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): E2EEnvironmentIdentity | undefined {
  const identity = getE2EEnvironmentIdentity(environmentVariables)
  if (identity?.mode === 'local' && environmentVariables.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED !== 'enabled') {
    throw new Error('A stack E2E local exige comprovação operacional dos containers autorizados antes do uso.')
  }
  return identity
}
