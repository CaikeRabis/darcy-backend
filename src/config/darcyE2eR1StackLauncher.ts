import {
  assertOperationalStackFor,
  assertStackPreflightFor,
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

  if (!snapshot.manifest.path.endsWith('infra/darcy-e2e-c0361-r1/docker-compose.yml')) {
    throw new Error('A evidência operacional não corresponde ao manifesto Compose R1.')
  }

  const services = snapshot.containers.map((container) => container.service).sort()
  if (snapshot.containers.length !== 3 || services.join(',') !== 'auth,db,gateway') {
    throw new Error('A stack R1 deve conter exatamente db, auth e gateway.')
  }

  if (snapshot.containers.some((container) => container.running !== true)) {
    throw new Error('Todos os containers R1 devem estar em execução.')
  }
}

export function createDarcyE2eR1OperationalEnvironment(
  environment: NodeJS.ProcessEnv,
  snapshot: OperationalStackSnapshot,
): NodeJS.ProcessEnv {
  // Compatibilidade para consumidores de teste: um snapshot simulado pode ser
  // validado, mas nunca concede autorização operacional nem emite o marcador.
  assertOperationalStackFor(snapshot, DARCY_E2E_R1_STACK)
  const isolated = { ...environment }
  delete isolated.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED
  return isolated
}

export function sanitizeDarcyE2eR1StackEvidence(snapshot: OperationalStackSnapshot): SanitizedStackEvidence {
  return sanitizeStackEvidenceFor(snapshot, DARCY_E2E_R1_STACK)
}
