#!/usr/bin/env node

const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { resolve } = require('node:path')

const DOCKER_TIMEOUT_MS = 10000
const DOCKER_MAX_BUFFER = 256 * 1024
const HEALTH_TIMEOUT_MS = 5000
const HEALTH_MAX_BUFFER = 64 * 1024
const repositoryRoot = resolve(__dirname, '..')
const manifestPath = resolve(repositoryRoot, 'infra/darcy-e2e-c0361-r1/docker-compose.yml')
const verifierPath = resolve(repositoryRoot, 'dist/config/darcyE2eR1StackVerifier.js')
const launcherPath = resolve(repositoryRoot, 'dist/config/darcyE2eR1StackLauncher.js')

function runDocker(argumentsList, exec = execFileSync) {
  try {
    return exec('docker', argumentsList, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: DOCKER_TIMEOUT_MS,
      maxBuffer: DOCKER_MAX_BUFFER,
      killSignal: 'SIGTERM',
    })
  } catch {
    throw new Error('Não foi possível coletar a evidência operacional do Docker.')
  }
}

function probeAuthHealth(url, exec = execFileSync) {
  try {
    const output = exec('curl', [
      '--silent', '--show-error', '--fail-with-body',
      '--max-time', String(HEALTH_TIMEOUT_MS / 1000),
      '--max-filesize', String(HEALTH_MAX_BUFFER),
      '--max-redirs', '0',
      '--dump-header', '-',
      '--write-out', '\nDARCY_HTTP_STATUS:%{http_code}\n',
      url,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: HEALTH_TIMEOUT_MS + 1000,
      maxBuffer: HEALTH_MAX_BUFFER,
      killSignal: 'SIGTERM',
    })

    const statusMatch = output.match(/\nDARCY_HTTP_STATUS:(\d+)\s*$/)
    if (!statusMatch) return { status: 0, contentType: '', body: null, redirected: false }
    const status = Number(statusMatch[1])
    const response = output.slice(0, statusMatch.index)
    const separator = response.indexOf('\r\n\r\n')
    if (separator < 0) return { status, contentType: '', body: null, redirected: false }
    const headers = response.slice(0, separator)
    const bodyText = response.slice(separator + 4).trim()
    const contentType = headers.match(/^content-type:\s*([^\r\n]+)/im)?.[1]?.trim() ?? ''
    let body = null
    try { body = JSON.parse(bodyText) } catch { body = null }
    return { status, contentType, body, redirected: status >= 300 && status < 400 }
  } catch {
    return { status: 0, contentType: '', body: null, redirected: false }
  }
}

function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--verify-operational') {
    throw new Error('Uso seguro: --verify-operational')
  }
  if (!existsSync(manifestPath) || !existsSync(verifierPath) || !existsSync(launcherPath)) {
    throw new Error('Artefatos do verificador R1 não estão disponíveis.')
  }

  const { collectDarcyE2eR1OperationalEvidence } = require(verifierPath)
  const { sanitizeDarcyE2eR1StackEvidence } = require(launcherPath)
  const evidence = collectDarcyE2eR1OperationalEvidence({
    runDocker,
    probeAuthHealth,
    manifestPath,
  })

  // A saída contém somente metadados sanitizados. O marcador operacional é
  // emitido pelo processo Prisma apenas após o exit code zero deste verificador.
  process.stdout.write(JSON.stringify({
    ...sanitizeDarcyE2eR1StackEvidence(evidence.snapshot),
    observedAt: evidence.observedAt,
    source: evidence.source,
  }) + '\n')
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na verificação operacional R1.'
    console.error(`[DARCY E2E R1] ${message}`)
    process.exitCode = 1
  }
}

module.exports = { runDocker, probeAuthHealth, main }
