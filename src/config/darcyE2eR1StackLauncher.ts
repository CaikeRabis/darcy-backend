import {
  assertOperationalStackFor,
  assertStackPreflightFor,
  createOperationalEnvironmentFor,
  DARCY_E2E_STACK_IMAGES,
  sanitizeStackEvidenceFor,
  type DedicatedStackPreflightInput,
  type OperationalStackSnapshot,
  type StackDefinition,
  type SanitizedStackEvidence,
} from './darcyE2eStackLauncher'
import {
  DARCY_E2E_R1_IDENTITY,
  DARCY_E2E_R1_SECRET_NAMES,
  resolveDarcyE2eR1Secrets,
  type DarcyE2eSecretConfiguration,
  type DarcyE2eSecretMode,
  type DarcyE2eSecretReader,
} from './darcyE2eSecretStore'

export const DARCY_E2E_R1_STACK: StackDefinition = {
  ...DARCY_E2E_R1_IDENTITY,
  manifestFile: 'docker-compose.yml',
  hostPorts: { gateway: 55521, database: 55522 },
  images: DARCY_E2E_STACK_IMAGES,
}

export interface DarcyE2eR1PreparationPlan {
  stackId: typeof DARCY_E2E_R1_IDENTITY.stackId
  composeProject: typeof DARCY_E2E_R1_IDENTITY.composeProject
  volume: typeof DARCY_E2E_R1_IDENTITY.databaseVolume
  requiredSecrets: readonly string[]
  operationalMarkerEligible: false
}

export function prepareDarcyE2eR1(): DarcyE2eR1PreparationPlan {
  return {
    stackId: DARCY_E2E_R1_IDENTITY.stackId,
    composeProject: DARCY_E2E_R1_IDENTITY.composeProject,
    volume: DARCY_E2E_R1_IDENTITY.databaseVolume,
    requiredSecrets: [...DARCY_E2E_R1_SECRET_NAMES],
    operationalMarkerEligible: false,
  }
}

export function resolveDarcyE2eR1Operation(
  mode: DarcyE2eSecretMode,
  reader: DarcyE2eSecretReader,
): DarcyE2eSecretConfiguration {
  return resolveDarcyE2eR1Secrets({
    stackId: DARCY_E2E_R1_IDENTITY.stackId,
    volumeId: DARCY_E2E_R1_IDENTITY.databaseVolume,
    mode,
  }, reader)
}

export function assertDarcyE2eR1Preflight(input: DedicatedStackPreflightInput): void {
  assertStackPreflightFor(input, DARCY_E2E_R1_STACK)
}

export function assertDarcyE2eR1OperationalStack(snapshot: OperationalStackSnapshot): void {
  assertOperationalStackFor(snapshot, DARCY_E2E_R1_STACK)
}

export function createDarcyE2eR1OperationalEnvironment(
  environment: NodeJS.ProcessEnv,
  snapshot: OperationalStackSnapshot,
): NodeJS.ProcessEnv {
  return createOperationalEnvironmentFor(environment, snapshot, DARCY_E2E_R1_STACK)
}

export function sanitizeDarcyE2eR1StackEvidence(snapshot: OperationalStackSnapshot): SanitizedStackEvidence {
  return sanitizeStackEvidenceFor(snapshot, DARCY_E2E_R1_STACK)
}
