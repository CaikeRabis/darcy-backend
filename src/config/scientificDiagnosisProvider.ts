import { assertE2EOperationalIdentity, getE2EEnvironmentIdentity } from './e2eEnvironment'

export type ScientificDiagnosisProviderMode = 'configured' | 'fake'

/**
 * Seleciona somente o generator do diagnóstico científico.
 * O modo ausente preserva o provider global já configurado para a aplicação.
 */
export function getScientificDiagnosisProviderMode(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): ScientificDiagnosisProviderMode {
  const configured = environmentVariables.DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER?.trim().toLowerCase()

  if (!configured || configured === 'configured') return 'configured'
  if (configured === 'fake') return 'fake'

  throw new Error('DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER deve ser "configured" ou "fake".')
}

function assertLoopbackCors(environmentVariables: NodeJS.ProcessEnv): void {
  const origin = environmentVariables.CORS_ORIGIN?.trim()
  if (!origin) throw new Error('Provider científico fake exige CORS_ORIGIN local.')

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error('Provider científico fake exige uma origem CORS local válida.')
  }

  if (
    parsed.protocol !== 'http:' ||
    (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') ||
    parsed.pathname !== '/' || parsed.search || parsed.hash
  ) {
    throw new Error('Provider científico fake exige CORS_ORIGIN em loopback.')
  }
}

/**
 * Falha fechado: fake só é permitido no perfil E2E explicitamente protegido,
 * com a flag científica ativa e identidade Auth/PostgreSQL comprovadamente
 * separada do Alpha. A validação também é usada antes do bind do servidor.
 */
export function assertScientificDiagnosisProviderConfiguration(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): ScientificDiagnosisProviderMode {
  const mode = getScientificDiagnosisProviderMode(environmentVariables)
  const identity = getE2EEnvironmentIdentity(environmentVariables)
  if (identity && mode !== 'fake') {
    throw new Error('Ambiente E2E exige provider científico fake; não há fallback para IA real.')
  }
  if (mode !== 'fake') return mode

  if (environmentVariables.DARCY_ENV_FILE !== '.env.e2e.local') {
    throw new Error('Provider científico fake exige DARCY_ENV_FILE=.env.e2e.local.')
  }
  if (environmentVariables.DARCY_E2E_GUARD !== 'enabled') {
    throw new Error('Provider científico fake exige DARCY_E2E_GUARD=enabled.')
  }
  if (environmentVariables.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new Error('Provider científico fake não pode ser ativado em produção.')
  }
  if (environmentVariables.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED?.trim().toLowerCase() !== 'enabled') {
    throw new Error('Provider científico fake exige DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED=enabled.')
  }

  assertE2EOperationalIdentity(environmentVariables)
  assertLoopbackCors(environmentVariables)
  return mode
}

export function isScientificDiagnosisFakeEnabled(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): boolean {
  return assertScientificDiagnosisProviderConfiguration(environmentVariables) === 'fake'
}
