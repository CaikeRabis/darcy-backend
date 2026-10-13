import { validateCorsConfiguration } from './cors'
import { getConfiguredAIProviderName } from '../services/ai/providerFactory'

export class EnvironmentConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnvironmentConfigurationError'
  }
}

function requireEnvironmentVariable(
  environmentVariables: NodeJS.ProcessEnv,
  name: string,
): void {
  if (!environmentVariables[name]?.trim()) {
    throw new EnvironmentConfigurationError(`Variável de ambiente obrigatória ausente: ${name}.`)
  }
}

function validatePort(environmentVariables: NodeJS.ProcessEnv): void {
  const configuredPort = environmentVariables.PORT?.trim()

  if (!configuredPort) {
    return
  }

  const port = Number(configuredPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new EnvironmentConfigurationError('PORT deve ser um inteiro entre 1 e 65535.')
  }
}

/**
 * Valida somente a configuração necessária para o processo HTTP em runtime.
 * DIRECT_URL é destinado ao Prisma CLI (migrations/introspection), não ao Prisma Client.
 */
export function validateEnvironment(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): void {
  validatePort(environmentVariables)
  requireEnvironmentVariable(environmentVariables, 'DATABASE_URL')
  requireEnvironmentVariable(environmentVariables, 'SUPABASE_URL')
  requireEnvironmentVariable(environmentVariables, 'SUPABASE_PUBLISHABLE_KEY')

  const provider = getConfiguredAIProviderName(environmentVariables)
  requireEnvironmentVariable(
    environmentVariables,
    provider === 'openai' ? 'OPENAI_API_KEY' : 'GEMINI_API_KEY',
  )

  try {
    validateCorsConfiguration(environmentVariables)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Configuração CORS inválida.'
    throw new EnvironmentConfigurationError(message)
  }
}
