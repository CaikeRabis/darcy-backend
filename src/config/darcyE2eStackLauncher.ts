import { basename } from 'node:path'

export const DARCY_E2E_STACK = {
  stackId: 'darcy-e2e-c0361',
  composeProject: 'darcy-e2e-c0361',
  network: 'darcy-e2e-c0361_network',
  databaseVolume: 'darcy-e2e-c0361_db',
  manifestFile: 'docker-compose.yml',
  hostPorts: {
    gateway: 55421,
    database: 55422,
  },
} as const

export const DARCY_E2E_STACK_IMAGES = {
  database: 'public.ecr.aws/supabase/postgres@sha256:6942962433a569e87f228b4d4ab7e11db5deca64e43babb3a038443ad6c4f1bb',
  auth: 'public.ecr.aws/supabase/gotrue@sha256:c0c25187a6b835e65a6f6e6c6b39d090e832d40e6de5186f2c038e0411944232',
  gateway: 'public.ecr.aws/supabase/kong@sha256:1b53405d8680a09d6f44494b7990bf7da2ea43f84a258c59717d4539abf09f6d',
} as const

export interface StackDefinition {
  stackId: string
  composeProject: string
  network: string
  databaseVolume: string
  manifestFile: string
  hostPorts: Readonly<{ gateway: number; database: number }>
  images: Readonly<{ database: string; auth: string; gateway: string }>
}

const DARCY_E2E_STACK_DEFINITION: StackDefinition = {
  ...DARCY_E2E_STACK,
  images: DARCY_E2E_STACK_IMAGES,
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])
const EXPECTED_SERVICES = ['db', 'auth', 'gateway'] as const

export interface DockerDaemonSnapshot {
  context: string
  host: string
  local: boolean
}

export interface ExistingContainerSnapshot {
  name: string
  labels: Record<string, string>
}

export interface ExistingResourcesSnapshot {
  containers: readonly ExistingContainerSnapshot[]
  networks: readonly string[]
  volumes: readonly string[]
  boundPorts: readonly number[]
}

export interface StackManifestSnapshot {
  path: string
  composeProject: string
  network: string
  volume: string
  hostPorts: readonly number[]
}

export interface StackEndpointsSnapshot {
  authUrl: string
  databaseUrl: string
  directUrl: string
}

export interface DedicatedStackPreflightInput {
  daemon: DockerDaemonSnapshot
  manifest: StackManifestSnapshot
  existing: ExistingResourcesSnapshot
  availableImages: readonly string[]
  endpoints: StackEndpointsSnapshot
}

export interface PortBindingSnapshot {
  hostIp: string
  hostPort: number
  containerPort: number
}

export interface OperationalContainerSnapshot {
  id: string
  name: string
  service: string
  image: string
  labels: Record<string, string>
  networks: readonly string[]
  mounts: readonly string[]
  ports: readonly PortBindingSnapshot[]
  health: 'healthy' | 'unhealthy' | 'starting' | 'none'
}

export interface OperationalStackSnapshot {
  daemon: DockerDaemonSnapshot
  manifest: StackManifestSnapshot
  endpoints: StackEndpointsSnapshot
  containers: readonly OperationalContainerSnapshot[]
}

function fail(message: string): never {
  throw new Error(`[DARCY E2E stack] ${message}`)
}

function assertPortList(ports: readonly number[], definition: StackDefinition): void {
  const expected: readonly number[] = Object.values(definition.hostPorts)
  if (ports.length !== expected.length || ports.some((port) => !expected.includes(port))) {
    fail('As portas publicadas não correspondem exclusivamente às portas DARCY reservadas.')
  }
}

export function assertLoopbackEndpointFor(value: string, kind: 'auth' | 'database', definition: StackDefinition): void {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    fail(`Endpoint ${kind} inválido.`)
  }

  const expectedPort = kind === 'auth'
    ? definition.hostPorts.gateway
    : definition.hostPorts.database

  if (
    (kind === 'auth' && url.protocol !== 'http:') ||
    (kind === 'database' && url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    url.port !== String(expectedPort) ||
    (kind === 'auth' && (url.username || url.password || url.pathname !== '/' || url.search || url.hash)) ||
    (kind === 'database' && (!url.pathname || url.pathname === '/'))
  ) {
    fail(`Endpoint ${kind} deve utilizar exclusivamente o loopback e a porta DARCY esperada.`)
  }
}

export function assertLoopbackEndpoint(value: string, kind: 'auth' | 'database'): void {
  assertLoopbackEndpointFor(value, kind, DARCY_E2E_STACK_DEFINITION)
}

export function assertStackPreflightFor(input: DedicatedStackPreflightInput, definition: StackDefinition): void {
  if (!input.daemon.local || input.daemon.context !== 'desktop-linux' || !input.daemon.host.startsWith('unix://')) {
    fail('O daemon Docker não é o Docker Desktop local esperado.')
  }

  if (
    input.manifest.composeProject !== definition.composeProject ||
    basename(input.manifest.path) !== definition.manifestFile ||
    input.manifest.network !== definition.network ||
    input.manifest.volume !== definition.databaseVolume
  ) {
    fail('O manifesto não identifica exclusivamente a stack DARCY autorizada.')
  }

  assertPortList(input.manifest.hostPorts, definition)
  assertLoopbackEndpointFor(input.endpoints.authUrl, 'auth', definition)
  assertLoopbackEndpointFor(input.endpoints.databaseUrl, 'database', definition)
  assertLoopbackEndpointFor(input.endpoints.directUrl, 'database', definition)

  if (input.endpoints.databaseUrl !== input.endpoints.directUrl) {
    fail('DATABASE_URL e DIRECT_URL devem ser idênticas na stack local.')
  }

  if (
    input.existing.networks.includes(definition.network) ||
    input.existing.volumes.includes(definition.databaseVolume) ||
    input.existing.boundPorts.some((port) => (Object.values(definition.hostPorts) as readonly number[]).includes(port))
  ) {
    fail('Existe colisão com um recurso ou porta reservada da stack DARCY.')
  }

  if (input.existing.containers.some((container) => (
    container.labels['com.docker.compose.project'] === definition.composeProject ||
    container.name.startsWith(`${definition.composeProject}-`)
  ))) {
    fail('Existe container com identidade DARCY preexistente de origem não comprovada.')
  }

  const requiredImages = Object.values(definition.images)
  if (requiredImages.some((image) => !input.availableImages.includes(image))) {
    fail('Uma ou mais imagens versionadas da stack DARCY não estão disponíveis localmente.')
  }
}

export function assertDedicatedStackPreflight(input: DedicatedStackPreflightInput): void {
  assertStackPreflightFor(input, DARCY_E2E_STACK_DEFINITION)
}

function assertContainerLabels(container: OperationalContainerSnapshot, definition: StackDefinition): void {
  if (
    container.labels['com.docker.compose.project'] !== definition.composeProject ||
    container.labels['com.docker.compose.service'] !== container.service
  ) {
    fail(`O container ${container.name} não possui os labels exclusivos esperados.`)
  }
}

function assertContainerNetwork(container: OperationalContainerSnapshot, definition: StackDefinition): void {
  if (container.networks.length !== 1 || container.networks[0] !== definition.network) {
    fail(`O container ${container.name} utiliza rede compartilhada ou inesperada.`)
  }
}

function assertContainerPorts(container: OperationalContainerSnapshot, definition: StackDefinition): void {
  for (const binding of container.ports) {
    if (binding.hostIp !== '127.0.0.1') {
      fail(`O container ${container.name} possui bind público ou não-loopback.`)
    }
  }

  if (container.service === 'db') {
    if (container.ports.length !== 1 || container.ports[0].hostPort !== definition.hostPorts.database) {
      fail('O PostgreSQL não está publicado exclusivamente na porta DARCY reservada.')
    }
  }
  if (container.service === 'gateway') {
    if (container.ports.length !== 1 || container.ports[0].hostPort !== definition.hostPorts.gateway) {
      fail('O gateway não está publicado exclusivamente na porta DARCY reservada.')
    }
  }
  if (container.service === 'auth' && container.ports.length !== 0) {
    fail('O Auth não deve publicar uma porta adicional fora do gateway.')
  }
}

export function assertOperationalStackFor(snapshot: OperationalStackSnapshot, definition: StackDefinition): void {
  if (!snapshot.daemon.local || snapshot.daemon.context !== 'desktop-linux') {
    fail('A comprovação operacional exige Docker Desktop local.')
  }

  assertStackPreflightFor({
    daemon: snapshot.daemon,
    manifest: snapshot.manifest,
    existing: { containers: [], networks: [], volumes: [], boundPorts: [] },
    availableImages: Object.values(definition.images),
    endpoints: snapshot.endpoints,
  }, definition)

  const byService = new Map(snapshot.containers.map((container) => [container.service, container]))
  for (const service of EXPECTED_SERVICES) {
    const container = byService.get(service)
    if (!container) fail(`Serviço obrigatório ausente: ${service}.`)

    assertContainerLabels(container, definition)
    assertContainerNetwork(container, definition)
    assertContainerPorts(container, definition)

    if (container.health !== 'healthy') {
      fail(`Health check não aprovado para o serviço ${service}.`)
    }
  }

  const db = byService.get('db') as OperationalContainerSnapshot
  const auth = byService.get('auth') as OperationalContainerSnapshot
  const gateway = byService.get('gateway') as OperationalContainerSnapshot

  if (db.image !== definition.images.database || auth.image !== definition.images.auth || gateway.image !== definition.images.gateway) {
    fail('Um container utiliza imagem diferente da referência local versionada.')
  }
  if (!db.mounts.includes(definition.databaseVolume)) {
    fail('O PostgreSQL não utiliza o volume exclusivo da stack DARCY.')
  }
}

export function assertOperationalStack(snapshot: OperationalStackSnapshot): void {
  assertOperationalStackFor(snapshot, DARCY_E2E_STACK_DEFINITION)
}

export function createOperationalEnvironmentFor(
  environment: NodeJS.ProcessEnv,
  snapshot: OperationalStackSnapshot,
  definition: StackDefinition,
): NodeJS.ProcessEnv {
  assertOperationalStackFor(snapshot, definition)
  return { ...environment, DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED: 'enabled' }
}

export function createOperationalEnvironment(
  environment: NodeJS.ProcessEnv,
  snapshot: OperationalStackSnapshot,
): NodeJS.ProcessEnv {
  return createOperationalEnvironmentFor(environment, snapshot, DARCY_E2E_STACK_DEFINITION)
}

export interface SanitizedStackEvidence {
  stackId: string
  composeProject: string
  network: string
  volumes: string[]
  containers: Array<{ id: string; name: string; service: string; image: string; health: string; ports: PortBindingSnapshot[] }>
}

export function sanitizeStackEvidenceFor(
  snapshot: OperationalStackSnapshot,
  definition: StackDefinition,
): SanitizedStackEvidence {
  return {
    stackId: definition.stackId,
    composeProject: definition.composeProject,
    network: definition.network,
    volumes: [definition.databaseVolume],
    containers: snapshot.containers.map((container) => ({
      id: container.id,
      name: container.name,
      service: container.service,
      image: container.image,
      health: container.health,
      ports: [...container.ports],
    })),
  }
}

export function sanitizeStackEvidence(snapshot: OperationalStackSnapshot): SanitizedStackEvidence {
  return sanitizeStackEvidenceFor(snapshot, DARCY_E2E_STACK_DEFINITION)
}
