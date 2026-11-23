#!/usr/bin/env node

const { execFileSync } = require('node:child_process')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')

const projectRoot = resolve(__dirname, '..')
const {
  assertOperationalStack,
  DARCY_E2E_STACK,
  sanitizeStackEvidence,
} = require(resolve(projectRoot, 'dist/config/darcyE2eStackLauncher.js'))

const manifestPath = resolve(projectRoot, 'infra/darcy-e2e-c0361/docker-compose.yml')
const composeProject = 'darcy-e2e-c0361'

function docker(args) {
  return execFileSync('docker', args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function readJsonLines(value) {
  return value.split('\n').filter(Boolean).map((line) => JSON.parse(line))
}

function inspectDocker() {
  const context = docker(['context', 'show'])
  const info = JSON.parse(docker(['info', '--format', '{{json .}}']))
  const containers = readJsonLines(docker(['ps', '-a', '--format', '{{json .}}']))
  const networks = readJsonLines(docker(['network', 'ls', '--format', '{{json .}}']))
  const volumes = readJsonLines(docker(['volume', 'ls', '--format', '{{json .}}']))
  const images = readJsonLines(docker(['images', '--format', '{{json .}}']))
  return { context, info, containers, networks, volumes, images }
}

function assertManifestPath() {
  const text = readFileSync(manifestPath, 'utf8')
  if (!text.includes('name: darcy-e2e-c0361')) throw new Error('Manifesto não identifica o projeto Compose DARCY.')
  return manifestPath
}

function inspectContainer(id) {
  const inspected = JSON.parse(docker(['inspect', id]))
  return inspected[0] ?? {}
}

function getPortBindings(container) {
  return Object.entries(container.NetworkSettings?.Ports ?? {}).flatMap(([containerPort, bindings]) => (
    (bindings ?? []).map((binding) => ({
      hostIp: binding.HostIp,
      hostPort: Number(binding.HostPort),
      containerPort: Number(containerPort.split('/')[0]),
    }))
  ))
}

function getAuthHealth() {
  try {
    execFileSync('curl', ['--silent', '--show-error', '--fail', '--max-time', '5', 'http://127.0.0.1:55421/auth/v1/health'], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return 'healthy'
  } catch {
    return 'unhealthy'
  }
}

function buildOperationalSnapshot() {
  const ids = docker(['ps', '-aq', '--filter', `label=com.docker.compose.project=${DARCY_E2E_STACK.composeProject}`]).split('\n').filter(Boolean)
  const containers = ids.map((id) => {
    const raw = inspectContainer(id)
    const labels = raw.Config?.Labels ?? {}
    const service = labels['com.docker.compose.service']
    return {
      id: raw.Id,
      name: String(raw.Name ?? '').replace(/^\//, ''),
      service,
      image: raw.Config?.Image,
      labels,
      networks: Object.keys(raw.NetworkSettings?.Networks ?? {}),
      mounts: (raw.Mounts ?? []).map((mount) => mount.Name).filter(Boolean),
      ports: getPortBindings(raw),
      health: service === 'auth'
        ? getAuthHealth()
        : raw.State?.Health?.Status ?? 'none',
    }
  })

  const daemonHost = docker(['context', 'inspect', 'desktop-linux', '--format', '{{(index .Endpoints "docker").Host}}'])
  return {
    daemon: { context: docker(['context', 'show']), host: daemonHost, local: daemonHost.startsWith('unix://') },
    manifest: {
      path: manifestPath,
      composeProject,
      network: DARCY_E2E_STACK.network,
      volume: DARCY_E2E_STACK.databaseVolume,
      hostPorts: Object.values(DARCY_E2E_STACK.hostPorts),
    },
    endpoints: {
      authUrl: 'http://127.0.0.1:55421',
      databaseUrl: 'postgresql://127.0.0.1:55422/postgres',
      directUrl: 'postgresql://127.0.0.1:55422/postgres',
    },
    containers,
  }
}

function main() {
  const command = process.argv.slice(2).join(' ')
  if (command !== '--inspect' && command !== '--verify-operational') {
    throw new Error('Uso seguro: --inspect ou --verify-operational')
  }

  const manifest = assertManifestPath()
  if (command === '--verify-operational') {
    const snapshot = buildOperationalSnapshot()
    assertOperationalStack(snapshot)
    console.log(JSON.stringify({
      ...sanitizeStackEvidence(snapshot),
      manifest,
      operationalMarker: 'available-only-to-authorized-child-process',
    }))
    return
  }

  const snapshot = inspectDocker()
  if (snapshot.context !== 'desktop-linux' || !snapshot.info.Name || snapshot.info.Name === 'unknown') {
    throw new Error('O daemon Docker não corresponde ao Docker Desktop local esperado.')
  }

  const conflicting = snapshot.containers.filter((container) => (
    container.Names === `${composeProject}-db-1` ||
    container.Names === `${composeProject}-auth-1` ||
    container.Names === `${composeProject}-gateway-1`
  ))
  if (conflicting.length > 0) throw new Error('Foram encontrados recursos DARCY preexistentes; nenhuma ação será executada.')

  console.log(JSON.stringify({
    manifest,
    composeProject,
    context: snapshot.context,
    containers: snapshot.containers.length,
    networks: snapshot.networks.map((network) => network.Name),
    volumes: snapshot.volumes.map((volume) => volume.Name),
    images: snapshot.images.length,
    operationalMarker: 'not-issued',
  }))
}

try {
  main()
} catch (error) {
  console.error(`[DARCY E2E stack] ${error instanceof Error ? error.message : 'falha de inspeção'}`)
  process.exitCode = 1
}
