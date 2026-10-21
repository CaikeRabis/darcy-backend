import { config } from 'dotenv'

const DEFAULT_ENVIRONMENT_FILE = '.env'
const E2E_ENVIRONMENT_FILE = '.env.e2e.local'

export function resolveEnvironmentFile(environmentVariables: NodeJS.ProcessEnv = process.env): string {
  const environmentFile = environmentVariables.DARCY_ENV_FILE?.trim() || DEFAULT_ENVIRONMENT_FILE

  if (environmentFile !== DEFAULT_ENVIRONMENT_FILE && environmentFile !== E2E_ENVIRONMENT_FILE) {
    throw new Error('DARCY_ENV_FILE inválido. Use .env ou .env.e2e.local.')
  }

  return environmentFile
}

export function loadRuntimeEnvironment(): void {
  const environmentFile = resolveEnvironmentFile()
  const result = config({ path: environmentFile, override: true })

  if (result.error) {
    throw new Error(`Não foi possível carregar o perfil de ambiente ${environmentFile}.`)
  }

  if (environmentFile === E2E_ENVIRONMENT_FILE && process.env.DARCY_E2E_GUARD !== 'enabled') {
    throw new Error('O perfil E2E exige DARCY_E2E_GUARD=enabled.')
  }
}
