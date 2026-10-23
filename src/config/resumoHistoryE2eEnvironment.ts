import { getE2EEnvironmentIdentity } from './e2eEnvironment'

const HISTORY_E2E_REQUIRED_VARIABLES = [
  'DARCY_E2E_GUARD',
  'DARCY_E2E_EXPECTED_SUPABASE_PROJECT_REF',
  'DARCY_ALPHA_SUPABASE_PROJECT_REF',
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'DARCY_E2E_USER_A_EMAIL',
  'DARCY_E2E_USER_A_PASSWORD',
  'DARCY_E2E_USER_B_EMAIL',
  'DARCY_E2E_USER_B_PASSWORD',
] as const

type HistoryE2ERequiredVariable = typeof HISTORY_E2E_REQUIRED_VARIABLES[number]

export interface ResumoHistoryE2EEnvironment {
  environment: NodeJS.ProcessEnv
  apiBaseUrl: string
}

interface HealthResponse {
  ok: true
  data: {
    status: 'alive'
    e2eEnvironment: {
      supabaseProjectRef: string
    }
  }
}

function getRequiredValue(profile: Record<string, string | undefined>, name: HistoryE2ERequiredVariable): string {
  const value = profile[name]?.trim()

  if (!value) {
    throw new Error('Perfil E2E de histórico incompleto. Preencha as variáveis obrigatórias em .env.e2e.local.')
  }

  return value
}

function getHistoryE2EApiBaseUrl(profile: Record<string, string | undefined>): string {
  const configuredPort = profile.PORT?.trim() || '3001'
  const configuredUrl = profile.DARCY_E2E_API_BASE_URL?.trim() || `http://127.0.0.1:${configuredPort}`

  let url: URL
  try {
    url = new URL(configuredUrl)
  } catch {
    throw new Error('DARCY_E2E_API_BASE_URL inválida para o teste E2E de histórico.')
  }

  if (
    url.protocol !== 'http:' ||
    (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('DARCY_E2E_API_BASE_URL deve apontar somente para o backend local E2E.')
  }

  return url.origin
}

export function createIsolatedResumoHistoryE2EEnvironment(
  profile: Record<string, string | undefined>,
  inheritedEnvironment: NodeJS.ProcessEnv = process.env,
): ResumoHistoryE2EEnvironment {
  const environment: NodeJS.ProcessEnv = {
    PATH: inheritedEnvironment.PATH,
  }

  for (const name of HISTORY_E2E_REQUIRED_VARIABLES) {
    environment[name] = getRequiredValue(profile, name)
  }

  const identity = getE2EEnvironmentIdentity(environment)
  if (!identity) {
    throw new Error('O teste E2E de histórico exige DARCY_E2E_GUARD=enabled.')
  }

  return {
    environment,
    apiBaseUrl: getHistoryE2EApiBaseUrl(profile),
  }
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  if (record.ok !== true || !record.data || typeof record.data !== 'object') return false

  const data = record.data as Record<string, unknown>
  if (data.status !== 'alive' || !data.e2eEnvironment || typeof data.e2eEnvironment !== 'object') return false

  const e2eEnvironment = data.e2eEnvironment as Record<string, unknown>
  return typeof e2eEnvironment.supabaseProjectRef === 'string'
}

/** Confirma que o processo HTTP local usa a mesma identidade isolada do perfil do teste. */
export function assertResumoHistoryE2EBackendIdentity(
  healthPayload: unknown,
  environmentVariables: NodeJS.ProcessEnv = process.env,
): void {
  const expectedIdentity = getE2EEnvironmentIdentity(environmentVariables)

  if (!expectedIdentity || !isHealthResponse(healthPayload)) {
    throw new Error('Não foi possível confirmar a identidade E2E do backend antes do teste de histórico.')
  }

  if (healthPayload.data.e2eEnvironment.supabaseProjectRef !== expectedIdentity.supabaseProjectRef) {
    throw new Error('O backend local não corresponde à identidade E2E esperada.')
  }
}
