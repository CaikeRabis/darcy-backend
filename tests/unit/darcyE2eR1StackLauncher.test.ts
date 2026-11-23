import { describe, expect, it } from 'vitest'
import {
  assertDarcyE2eR1OperationalStack,
  assertDarcyE2eR1Preflight,
  createDarcyE2eR1OperationalEnvironment,
  DARCY_E2E_R1_STACK,
  prepareDarcyE2eR1,
  sanitizeDarcyE2eR1StackEvidence,
} from '../../src/config/darcyE2eR1StackLauncher'
import { DARCY_E2E_R1_IDENTITY } from '../../src/config/darcyE2eSecretStore'
import { DARCY_E2E_STACK_IMAGES, type DedicatedStackPreflightInput, type OperationalStackSnapshot } from '../../src/config/darcyE2eStackLauncher'
import { getE2EEnvironmentIdentity } from '../../src/config/e2eEnvironment'

const daemon = { context: 'desktop-linux', host: 'unix:///Users/test/.docker/run/docker.sock', local: true }
const endpoints = {
  authUrl: 'http://127.0.0.1:55521',
  databaseUrl: 'postgresql://127.0.0.1:55522/postgres',
  directUrl: 'postgresql://127.0.0.1:55522/postgres',
}
const manifest = {
  path: '/repo/infra/darcy-e2e-c0361-r1/docker-compose.yml',
  composeProject: DARCY_E2E_R1_STACK.composeProject,
  network: DARCY_E2E_R1_STACK.network,
  volume: DARCY_E2E_R1_STACK.databaseVolume,
  hostPorts: [55521, 55522],
}

function preflight(overrides: Partial<DedicatedStackPreflightInput> = {}): DedicatedStackPreflightInput {
  return {
    daemon,
    manifest,
    existing: { containers: [], networks: [], volumes: [], boundPorts: [] },
    availableImages: Object.values(DARCY_E2E_STACK_IMAGES),
    endpoints,
    ...overrides,
  }
}

function operational(overrides: Partial<OperationalStackSnapshot> = {}): OperationalStackSnapshot {
  return {
    daemon,
    manifest,
    endpoints,
    containers: [
      {
        id: 'r1-db', name: 'darcy-e2e-c0361-r1-db-1', service: 'db', image: DARCY_E2E_STACK_IMAGES.database,
        labels: { 'com.docker.compose.project': DARCY_E2E_R1_STACK.composeProject, 'com.docker.compose.service': 'db' },
        networks: [DARCY_E2E_R1_STACK.network], mounts: [DARCY_E2E_R1_STACK.databaseVolume],
        ports: [{ hostIp: '127.0.0.1', hostPort: 55522, containerPort: 5432 }], health: 'healthy',
      },
      {
        id: 'r1-auth', name: 'darcy-e2e-c0361-r1-auth-1', service: 'auth', image: DARCY_E2E_STACK_IMAGES.auth,
        labels: { 'com.docker.compose.project': DARCY_E2E_R1_STACK.composeProject, 'com.docker.compose.service': 'auth' },
        networks: [DARCY_E2E_R1_STACK.network], mounts: [], ports: [], health: 'healthy',
      },
      {
        id: 'r1-gateway', name: 'darcy-e2e-c0361-r1-gateway-1', service: 'gateway', image: DARCY_E2E_STACK_IMAGES.gateway,
        labels: { 'com.docker.compose.project': DARCY_E2E_R1_STACK.composeProject, 'com.docker.compose.service': 'gateway' },
        networks: [DARCY_E2E_R1_STACK.network], mounts: [],
        ports: [{ hostIp: '127.0.0.1', hostPort: 55521, containerPort: 8000 }], health: 'healthy',
      },
    ],
    ...overrides,
  }
}

describe('launcher da stack R1', () => {
  it('D01/D02/O04 prepara identidade, volume e não fornece marcador', () => {
    const plan = prepareDarcyE2eR1()
    expect(plan.stackId).toBe(DARCY_E2E_R1_IDENTITY.stackId)
    expect(plan.volume).toBe(DARCY_E2E_R1_IDENTITY.databaseVolume)
    expect(plan.requiredSecrets).toEqual(['DARCY_E2E_POSTGRES_PASSWORD', 'DARCY_E2E_JWT_SECRET'])
    expect(plan.operationalMarkerEligible).toBe(false)
  })

  it('D01 aceita somente o projeto Compose R1', () => {
    expect(() => assertDarcyE2eR1Preflight(preflight())).not.toThrow()
    expect(() => assertDarcyE2eR1Preflight(preflight({ manifest: { ...manifest, composeProject: 'supabase' } }))).toThrow()
  })

  it('D03 rejeita o volume original', () => {
    expect(() => assertDarcyE2eR1Preflight(preflight({ manifest: { ...manifest, volume: 'darcy-e2e-c0361_db' } }))).toThrow()
  })

  it('D04/D05 rejeita rede e portas incompatíveis', () => {
    expect(() => assertDarcyE2eR1Preflight(preflight({ manifest: { ...manifest, network: 'supabase_network_supabase' } }))).toThrow()
    expect(() => assertDarcyE2eR1Preflight(preflight({ manifest: { ...manifest, hostPorts: [55421, 55422] } }))).toThrow()
  })

  it('D06/D07 rejeita bind público e daemon remoto', () => {
    const snapshot = operational()
    snapshot.containers[2].ports[0].hostIp = '0.0.0.0'
    expect(() => assertDarcyE2eR1OperationalStack(snapshot)).toThrow()
    expect(() => assertDarcyE2eR1Preflight(preflight({ daemon: { ...daemon, local: false, host: 'tcp://remote:2375' } }))).toThrow()
  })

  it('D08 rejeita imagem divergente', () => {
    const snapshot = operational()
    snapshot.containers[0].image = 'postgres:latest'
    expect(() => assertDarcyE2eR1OperationalStack(snapshot)).toThrow()
  })

  it('D09/D10 bloqueia serviço ausente ou health não aprovado', () => {
    expect(() => assertDarcyE2eR1OperationalStack({ ...operational(), containers: operational().containers.slice(0, 2) })).toThrow()
    const snapshot = operational()
    snapshot.containers[1].health = 'unhealthy'
    expect(() => assertDarcyE2eR1OperationalStack(snapshot)).toThrow()
  })

  it('O01/O02 exige segredos externos e não gera credenciais', () => {
    const plan = prepareDarcyE2eR1()
    expect(plan.requiredSecrets).toHaveLength(2)
    expect(plan).not.toHaveProperty('postgresPassword')
    expect(plan).not.toHaveProperty('jwtSecret')
  })

  it('O03/O05 mantém identidade e marcador sob responsabilidade separada', () => {
    expect(DARCY_E2E_R1_STACK.databaseVolume).not.toBe('darcy-e2e-c0361_db')
    expect(prepareDarcyE2eR1().operationalMarkerEligible).toBe(false)
  })

  it('F compatibiliza a identidade R1 com a guarda local existente', () => {
    const identity = getE2EEnvironmentIdentity({
      DARCY_E2E_GUARD: 'enabled',
      DARCY_ENV_FILE: '.env.e2e.local',
      NODE_ENV: 'development',
      DARCY_E2E_LOCAL_STACK_ID: DARCY_E2E_R1_STACK.stackId,
      DARCY_ALPHA_SUPABASE_PROJECT_REF: 'knexetasdgspwikpvjkx',
      DARCY_E2E_LOCAL_GATEWAY_PORT: '55521',
      DARCY_E2E_LOCAL_DATABASE_PORT: '55522',
      DARCY_E2E_LOCAL_DIRECT_PORT: '55522',
      SUPABASE_URL: 'http://127.0.0.1:55521',
      DATABASE_URL: 'postgresql://127.0.0.1:55522/postgres',
      DIRECT_URL: 'postgresql://127.0.0.1:55522/postgres',
    })
    expect(identity?.localStackId).toBe(DARCY_E2E_R1_STACK.stackId)
  })

  it('F rejeita produção ou referência remota no perfil local R1', () => {
    expect(() => getE2EEnvironmentIdentity({
      DARCY_E2E_GUARD: 'enabled', DARCY_ENV_FILE: '.env.e2e.local', NODE_ENV: 'production',
      DARCY_E2E_LOCAL_STACK_ID: DARCY_E2E_R1_STACK.stackId,
      DARCY_ALPHA_SUPABASE_PROJECT_REF: 'knexetasdgspwikpvjkx',
      DARCY_E2E_LOCAL_GATEWAY_PORT: '55521', DARCY_E2E_LOCAL_DATABASE_PORT: '55522', DARCY_E2E_LOCAL_DIRECT_PORT: '55522',
      SUPABASE_URL: 'http://127.0.0.1:55521', DATABASE_URL: 'postgresql://127.0.0.1:55522/postgres', DIRECT_URL: 'postgresql://127.0.0.1:55522/postgres',
    })).toThrow()
  })

  it('O05 só fornece o marcador após comprovação operacional R1', () => {
    expect(() => createDarcyE2eR1OperationalEnvironment({}, { ...operational(), containers: [] })).toThrow()
    expect(createDarcyE2eR1OperationalEnvironment({}, operational()).DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED).toBe('enabled')
  })

  it('O09 sanitiza evidências com a identidade R1, sem reutilizar a stack original', () => {
    const evidence = sanitizeDarcyE2eR1StackEvidence(operational())
    expect(evidence.stackId).toBe(DARCY_E2E_R1_STACK.stackId)
    expect(evidence.volumes).toEqual([DARCY_E2E_R1_STACK.databaseVolume])
    expect(evidence.stackId).not.toBe('darcy-e2e-c0361')
  })
})
