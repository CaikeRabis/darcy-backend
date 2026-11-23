import { describe, expect, it } from 'vitest'
import {
  assertDedicatedStackPreflight,
  assertOperationalStack,
  createOperationalEnvironment,
  DARCY_E2E_STACK,
  DARCY_E2E_STACK_IMAGES,
  sanitizeStackEvidence,
  type OperationalStackSnapshot,
} from '../../src/config/darcyE2eStackLauncher'

const daemon = { context: 'desktop-linux', host: 'unix:///Users/test/.docker/run/docker.sock', local: true }
const endpoints = {
  authUrl: 'http://127.0.0.1:55421',
  databaseUrl: 'postgresql://postgres:synthetic@127.0.0.1:55422/postgres',
  directUrl: 'postgresql://postgres:synthetic@127.0.0.1:55422/postgres',
}
const manifest = {
  path: '/repo/infra/darcy-e2e-c0361/docker-compose.yml',
  composeProject: DARCY_E2E_STACK.composeProject,
  network: DARCY_E2E_STACK.network,
  volume: DARCY_E2E_STACK.databaseVolume,
  hostPorts: [55421, 55422],
}

function preflight(overrides: Record<string, unknown> = {}) {
  return {
    daemon,
    manifest,
    existing: { containers: [], networks: [], volumes: [], boundPorts: [] },
    availableImages: Object.values(DARCY_E2E_STACK_IMAGES),
    endpoints,
    ...overrides,
  }
}

function operationalSnapshot(overrides: Partial<OperationalStackSnapshot> = {}): OperationalStackSnapshot {
  return {
    daemon,
    manifest,
    endpoints,
    containers: [
      {
        id: 'db-id', name: 'darcy-e2e-c0361-db-1', service: 'db', image: DARCY_E2E_STACK_IMAGES.database,
        labels: { 'com.docker.compose.project': DARCY_E2E_STACK.composeProject, 'com.docker.compose.service': 'db', 'com.docker.compose.network': DARCY_E2E_STACK.network },
        networks: [DARCY_E2E_STACK.network], mounts: [DARCY_E2E_STACK.databaseVolume],
        ports: [{ hostIp: '127.0.0.1', hostPort: 55422, containerPort: 5432 }], health: 'healthy',
      },
      {
        id: 'auth-id', name: 'darcy-e2e-c0361-auth-1', service: 'auth', image: DARCY_E2E_STACK_IMAGES.auth,
        labels: { 'com.docker.compose.project': DARCY_E2E_STACK.composeProject, 'com.docker.compose.service': 'auth', 'com.docker.compose.network': DARCY_E2E_STACK.network },
        networks: [DARCY_E2E_STACK.network], mounts: [], ports: [], health: 'healthy',
      },
      {
        id: 'gateway-id', name: 'darcy-e2e-c0361-gateway-1', service: 'gateway', image: DARCY_E2E_STACK_IMAGES.gateway,
        labels: { 'com.docker.compose.project': DARCY_E2E_STACK.composeProject, 'com.docker.compose.service': 'gateway', 'com.docker.compose.network': DARCY_E2E_STACK.network },
        networks: [DARCY_E2E_STACK.network], mounts: [], ports: [{ hostIp: '127.0.0.1', hostPort: 55421, containerPort: 8000 }], health: 'healthy',
      },
    ],
    ...overrides,
  }
}

describe('launcher da stack DARCY E2E dedicada', () => {
  it('L01 identifica corretamente a stack exclusiva', () => expect(() => assertDedicatedStackPreflight(preflight())).not.toThrow())
  it('L02 rejeita o projeto Compose supabase', () => expect(() => assertDedicatedStackPreflight(preflight({ manifest: { ...manifest, composeProject: 'supabase' } }))).toThrow())
  it('L03 rejeita containers com labels ausentes na comprovação', () => {
    const snapshot = operationalSnapshot()
    snapshot.containers[0].labels['com.docker.compose.project'] = 'supabase'
    expect(() => assertOperationalStack(snapshot)).toThrow()
  })
  it('L04 rejeita rede compartilhada', () => expect(() => assertDedicatedStackPreflight(preflight({ manifest: { ...manifest, network: 'supabase_network_supabase' } }))).toThrow())
  it('L05 rejeita volume compartilhado', () => expect(() => assertDedicatedStackPreflight(preflight({ manifest: { ...manifest, volume: 'supabase_db_supabase' } }))).toThrow())
  it('L06 rejeita portas inesperadas', () => expect(() => assertDedicatedStackPreflight(preflight({ manifest: { ...manifest, hostPorts: [54321, 54322] } }))).toThrow())
  it('L07 rejeita bind público', () => {
    const snapshot = operationalSnapshot()
    snapshot.containers[2].ports[0].hostIp = '0.0.0.0'
    expect(() => assertOperationalStack(snapshot)).toThrow()
  })
  it('L08 rejeita daemon remoto', () => expect(() => assertDedicatedStackPreflight(preflight({ daemon: { ...daemon, local: false, host: 'tcp://remote:2375' } }))).toThrow())
  it('L09 rejeita Auth remoto', () => expect(() => assertDedicatedStackPreflight(preflight({ endpoints: { ...endpoints, authUrl: 'https://remote.supabase.co' } }))).toThrow())
  it('L10 rejeita PostgreSQL remoto', () => expect(() => assertDedicatedStackPreflight(preflight({ endpoints: { ...endpoints, databaseUrl: 'postgresql://remote:5432/postgres' } }))).toThrow())
  it('L11 rejeita mistura de DATABASE_URL e DIRECT_URL', () => expect(() => assertDedicatedStackPreflight(preflight({ endpoints: { ...endpoints, directUrl: 'postgresql://postgres:synthetic@127.0.0.1:55423/postgres' } }))).toThrow())
  it('L12 rejeita identidade conflitante de container', () => expect(() => assertDedicatedStackPreflight(preflight({ existing: { containers: [{ name: 'darcy-e2e-c0361-db-1', labels: {} }], networks: [], volumes: [], boundPorts: [] } }))).toThrow())
  it('L13 falha quando serviço está ausente', () => expect(() => assertOperationalStack({ ...operationalSnapshot(), containers: operationalSnapshot().containers.slice(0, 2) })).toThrow())
  it('L14 falha quando health check não passa', () => {
    const snapshot = operationalSnapshot()
    snapshot.containers[1].health = 'unhealthy'
    expect(() => assertOperationalStack(snapshot)).toThrow()
  })
  it('L15 não fornece marcador antes da comprovação', () => expect(() => createOperationalEnvironment({}, { ...operationalSnapshot(), containers: [] })).toThrow())
  it('L16 fornece marcador somente após comprovação bem-sucedida', () => expect(createOperationalEnvironment({}, operationalSnapshot()).DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED).toBe('enabled'))
  it('L17 não altera snapshot de recursos preexistentes', () => {
    const input = preflight()
    const before = JSON.stringify(input)
    expect(() => assertDedicatedStackPreflight(input)).not.toThrow()
    expect(JSON.stringify(input)).toBe(before)
  })
  it('L18 sanitiza evidências sem secrets', () => {
    const evidence = sanitizeStackEvidence(operationalSnapshot())
    expect(JSON.stringify(evidence)).not.toMatch(/synthetic|JWT|password|token/i)
    expect(evidence.containers).toHaveLength(3)
  })
})
