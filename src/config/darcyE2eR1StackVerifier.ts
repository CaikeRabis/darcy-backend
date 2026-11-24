import {
  assertDarcyE2eR1OperationalStack,
  DARCY_E2E_R1_STACK,
} from './darcyE2eR1StackLauncher'
import type {
  DockerDaemonSnapshot,
  OperationalContainerSnapshot,
  OperationalStackSnapshot,
  PortBindingSnapshot,
} from './darcyE2eStackLauncher'

export type DockerCommandRunner = (argumentsList: readonly string[]) => string

export interface AuthHealthProbeResult {
  status: number
  contentType: string
  body: unknown
  redirected?: boolean
}

export type AuthHealthProbe = (url: string) => AuthHealthProbeResult

export interface DarcyE2eR1OperationalEvidence {
  readonly source: 'docker'
  readonly observedAt: string
  readonly snapshot: OperationalStackSnapshot
}

export const DARCY_E2E_R1_AUTH_HEALTH_URL = 'http://127.0.0.1:55521/auth/v1/health'

export interface DarcyE2eR1StackVerifierDependencies {
  runDocker: DockerCommandRunner
  probeAuthHealth: AuthHealthProbe
  manifestPath: string
  now?: () => string
}

function fail(message: string): never {
  throw new Error(`[DARCY E2E R1] ${message}`)
}

function parseJson<T>(value: string, description: string): T {
  try {
    return JSON.parse(value) as T
  } catch {
    fail(`Resposta inválida ao consultar ${description}.`)
  }
}

function docker(dependencies: DarcyE2eR1StackVerifierDependencies, argumentsList: readonly string[]): string {
  try {
    return dependencies.runDocker(argumentsList)
  } catch {
    // Nunca repassar stderr do Docker: ele pode conter configurações sensíveis.
    fail('Não foi possível coletar a evidência operacional do Docker.')
  }
}

function getDaemon(dependencies: DarcyE2eR1StackVerifierDependencies): DockerDaemonSnapshot {
  const context = docker(dependencies, ['context', 'show']).trim()
  const host = docker(dependencies, [
    'context', 'inspect', 'desktop-linux', '--format', '{{(index .Endpoints "docker").Host}}',
  ]).trim()
  const info = parseJson<{ Name?: string }>(
    docker(dependencies, ['info', '--format', '{{json .}}']),
    'docker info',
  )

  if (context !== 'desktop-linux' || !host.startsWith('unix://') || !info.Name || info.Name === 'unknown') {
    fail('O daemon não corresponde ao Docker Desktop local esperado.')
  }

  return { context, host, local: true }
}

function getPortBindings(container: Record<string, any>): PortBindingSnapshot[] {
  return Object.entries(container.NetworkSettings?.Ports ?? {}).flatMap(([containerPort, bindings]) => (
    (Array.isArray(bindings) ? bindings : []).map((binding: any) => ({
      hostIp: String(binding.HostIp),
      hostPort: Number(binding.HostPort),
      containerPort: Number(containerPort.split('/')[0]),
    }))
  ))
}

function inspectContainer(
  dependencies: DarcyE2eR1StackVerifierDependencies,
  id: string,
): OperationalContainerSnapshot {
  const inspected = parseJson<Record<string, any>[]>(
    docker(dependencies, ['inspect', id]),
    `container ${id}`,
  )[0]
  if (!inspected) fail('Container R1 não encontrado durante a inspeção.')

  const labels = inspected.Config?.Labels ?? {}
  const service = labels['com.docker.compose.service']
  if (typeof service !== 'string') fail('Container R1 sem label de serviço Compose.')

  return {
    id: String(inspected.Id),
    name: String(inspected.Name ?? '').replace(/^\//, ''),
    service,
    image: String(inspected.Config?.Image ?? ''),
    labels,
    networks: Object.keys(inspected.NetworkSettings?.Networks ?? {}),
    mounts: (Array.isArray(inspected.Mounts) ? inspected.Mounts : [])
      .map((mount: any) => mount.Name)
      .filter((name: unknown): name is string => typeof name === 'string'),
    ports: getPortBindings(inspected),
    health: inspected.State?.Health?.Status ?? 'none',
    running: inspected.State?.Running === true,
  }
}

function assertNetworkMembership(
  networkResource: Record<string, any>,
  containers: readonly OperationalContainerSnapshot[],
): void {
  const members = networkResource.Containers
  if (!members || typeof members !== 'object' || Array.isArray(members)) {
    fail('A evidência da rede R1 não contém seus membros efetivos.')
  }

  const expectedIds = new Set(containers.map((container) => container.id))
  const memberIds = Object.keys(members)
  if (memberIds.length !== expectedIds.size || memberIds.some((id) => !expectedIds.has(id))) {
    fail('A rede R1 contém membro externo, desconhecido ou ausente.')
  }

  for (const container of containers) {
    const membership = members[container.id]
    if (!membership || membership.Name !== container.name) {
      fail('A associação bidirecional da rede R1 é inconsistente.')
    }
  }
}

function assertAuthHealthUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    fail('O health check Auth possui URL inválida.')
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    parsed.port !== '55521' ||
    parsed.pathname !== '/auth/v1/health' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    fail('O health check Auth deve usar exatamente o gateway local R1.')
  }
}

/**
 * Validação pura da resposta documentada do GoTrue. Ela não emite marcador
 * operacional e pode ser exercitada apenas com respostas simuladas.
 */
export function assertDarcyE2eR1AuthHealthResponse(
  url: string,
  response: AuthHealthProbeResult,
): void {
  assertAuthHealthUrl(url)
  if (response.redirected === true || response.status !== 200) {
    fail('O health check Auth não retornou HTTP 200 sem redirecionamento.')
  }
  const mediaType = response.contentType.split(';', 1)[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') {
    fail('O health check Auth não retornou application/json.')
  }
  const body = response.body
  if (
    !body ||
    typeof body !== 'object' ||
    Array.isArray(body) ||
    typeof (body as Record<string, unknown>).version !== 'string' ||
    typeof (body as Record<string, unknown>).name !== 'string' ||
    typeof (body as Record<string, unknown>).description !== 'string' ||
    !(body as Record<string, string>).name.trim() ||
    !(body as Record<string, string>).description.trim()
  ) {
    fail('O health check Auth não possui o formato GoTrue esperado.')
  }
}

function assertResourceIdentity(
  dependencies: DarcyE2eR1StackVerifierDependencies,
  kind: 'network' | 'volume',
  expectedName: string,
): Record<string, any> {
  const resources = parseJson<Record<string, any>[]>(
    docker(dependencies, [kind, 'inspect', expectedName]),
    `${kind} R1`,
  )
  const resource = resources[0]
  const labels = resource?.Labels ?? {}
  const name = resource?.Name

  if (!resource || name !== expectedName || labels['com.docker.compose.project'] !== DARCY_E2E_R1_STACK.composeProject) {
    fail(`A identidade do ${kind} não corresponde exclusivamente à stack R1.`)
  }
  return resource
}

/**
 * Coleta evidências diretamente do daemon Docker. Este módulo não inicia,
 * para, cria ou remove qualquer recurso.
 */
export function collectDarcyE2eR1OperationalEvidence(
  dependencies: DarcyE2eR1StackVerifierDependencies,
): DarcyE2eR1OperationalEvidence {
  const daemon = getDaemon(dependencies)
  const network = assertResourceIdentity(dependencies, 'network', DARCY_E2E_R1_STACK.network)
  assertResourceIdentity(dependencies, 'volume', DARCY_E2E_R1_STACK.databaseVolume)

  const ids = docker(dependencies, [
    'ps', '-aq', '--filter', `label=com.docker.compose.project=${DARCY_E2E_R1_STACK.composeProject}`,
  ]).split('\n').map((id) => id.trim()).filter(Boolean)
  if (ids.length !== 3) fail('A stack R1 não possui exatamente três containers identificados pelo projeto Compose.')

  const containers = ids.map((id) => inspectContainer(dependencies, id))
  assertNetworkMembership(network, containers)
  const authHealth = dependencies.probeAuthHealth(DARCY_E2E_R1_AUTH_HEALTH_URL)
  assertDarcyE2eR1AuthHealthResponse(DARCY_E2E_R1_AUTH_HEALTH_URL, authHealth)
  const healthAdjusted = containers.map((container) => (
    container.service === 'auth' || container.service === 'gateway'
      ? { ...container, health: 'healthy' as const }
      : container
  ))

  const snapshot: OperationalStackSnapshot = {
    daemon,
    manifest: {
      path: dependencies.manifestPath,
      composeProject: DARCY_E2E_R1_STACK.composeProject,
      network: DARCY_E2E_R1_STACK.network,
      volume: DARCY_E2E_R1_STACK.databaseVolume,
      hostPorts: Object.values(DARCY_E2E_R1_STACK.hostPorts),
    },
    endpoints: {
      authUrl: 'http://127.0.0.1:55521',
      databaseUrl: 'postgresql://127.0.0.1:55522/postgres',
      directUrl: 'postgresql://127.0.0.1:55522/postgres',
    },
    containers: healthAdjusted,
  }

  assertDarcyE2eR1OperationalStack(snapshot)
  return {
    source: 'docker',
    observedAt: dependencies.now?.() ?? new Date().toISOString(),
    snapshot,
  }
}
