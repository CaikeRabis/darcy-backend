const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const { parse } = require('dotenv')

const repositoryRoot = process.cwd()
const profilePath = resolve(repositoryRoot, '.env.e2e.local')
const guardPath = resolve(repositoryRoot, 'dist/config/e2eEnvironment.js')
const environmentFactoryPath = resolve(repositoryRoot, 'dist/config/prismaE2eEnvironment.js')
const prismaCliPath = require.resolve('prisma/build/index.js')
const schemaPath = resolve(repositoryRoot, 'prisma/schema.prisma')
const r1VerifierPath = resolve(repositoryRoot, 'scripts/verify-darcy-e2e-r1-stack.cjs')
const R1_STACK_ID = 'darcy-e2e-c0361-r1'
const PROCESS_MAX_BUFFER = 256 * 1024
const TIMEOUTS_MS = {
  verifier: 30000,
  identity: 15000,
  validate: 15000,
  status: 30000,
  deploy: 120000,
}

function timeoutFor(argumentsList, fallback = TIMEOUTS_MS.identity) {
  if (argumentsList.includes('deploy')) return TIMEOUTS_MS.deploy
  if (argumentsList.includes('status')) return TIMEOUTS_MS.status
  if (argumentsList.includes('validate')) return TIMEOUTS_MS.validate
  return fallback
}

function run(command, argumentsList, environment, workingDirectory, timeoutMs = timeoutFor(argumentsList), exec = execFileSync) {
  try {
    exec(command, argumentsList, {
      cwd: workingDirectory,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: PROCESS_MAX_BUFFER,
      killSignal: 'SIGTERM',
    })
  } catch (error) {
    if (error && typeof error === 'object' && (error.killed === true || error.code === 'ETIMEDOUT' || error.signal === 'SIGTERM')) {
      throw new Error('O processo Prisma E2E excedeu o timeout operacional; o estado da operação é indeterminado.')
    }
    const rawStderr = error && typeof error === 'object' ? error.stderr : undefined
    const rawStdout = error && typeof error === 'object' ? error.stdout : undefined
    const stderr = Buffer.isBuffer(rawStderr) ? rawStderr.toString('utf8') : typeof rawStderr === 'string' ? rawStderr : ''
    const stdout = Buffer.isBuffer(rawStdout) ? rawStdout.toString('utf8') : typeof rawStdout === 'string' ? rawStdout : ''
    const diagnostic = `${stderr}\n${stdout}`
    const prismaCode = diagnostic.match(/\bP\d{4}\b/)?.[0]
    const errno = error && typeof error === 'object' && 'errno' in error && typeof error.errno === 'string' ? error.errno : undefined
    const migrationsPending = /not yet been applied|migration.*pending/i.test(diagnostic)
    const migrationNames = [...diagnostic.matchAll(/\b20[0-9]{12}_[a-z0-9_]+\b/g)].map((match) => match[0])
    const category = prismaCode === 'P1000' || /authentication failed|password authentication|invalid password/i.test(diagnostic) ? 'postgres-authentication'
      : prismaCode === 'P1001' ? 'database-unreachable'
        : prismaCode === 'P1011' || /certificate|tls|ssl/i.test(diagnostic) ? 'tls-or-ssl'
          : prismaCode === 'P1013' ? 'database-url-invalid'
            : prismaCode === 'P3009' || /failed migration/i.test(diagnostic) ? 'failed-migration'
              : /divergent migration|migration history.*diverg|drift/i.test(diagnostic) ? 'migration-divergence'
                : migrationsPending ? 'pending-migrations'
                  : /tenant or user not found|pooler.*user|user.*pooler/i.test(diagnostic) ? 'supabase-pooler-authentication'
                    : /ENOTFOUND|EAI_AGAIN/.test(diagnostic) || ['ENOTFOUND', 'EAI_AGAIN'].includes(errno ?? '') ? 'dns'
                      : /ECONNREFUSED|ETIMEDOUT|ECONNRESET/.test(diagnostic) || ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'].includes(errno ?? '') ? 'tcp-network'
                        : 'prisma-or-database'
    const stage = argumentsList.includes('status') ? 'migration-status'
      : argumentsList[0] === '-e' ? 'environment-identity'
        : 'prisma-command'
    const exit = error && typeof error === 'object' && 'status' in error && typeof error.status === 'number' ? error.status : undefined
    throw new Error(`Processo E2E falhou (stage=${stage}, prismaCode=${prismaCode ?? 'none'}, exit=${exit ?? 'none'}, category=${category}, migrations=${migrationNames.join(',') || 'none'}); saída foi omitida por segurança.`)
  }
}

function main() {
  try {
    const profile = parse(readFileSync(profilePath))
    const {
      createIsolatedPrismaE2EEnvironment,
      getPrismaE2ECommand,
    } = require(environmentFactoryPath)

    // Nunca herdar um marcador operacional: para a R1 ele só pode ser emitido
    // após uma coleta Docker atual, no mesmo processo desta execução Prisma.
    const inheritedEnvironment = { ...process.env }
    delete inheritedEnvironment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED
    const localStackId = profile.DARCY_E2E_LOCAL_STACK_ID?.trim()
    if (localStackId) {
      if (localStackId !== R1_STACK_ID) {
        throw new Error('O fluxo Prisma E2E local aceita exclusivamente a stack R1.')
      }

      run(process.execPath, [r1VerifierPath, '--verify-operational'], inheritedEnvironment, repositoryRoot, TIMEOUTS_MS.verifier)
      inheritedEnvironment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED = 'enabled'
    }

    const environment = createIsolatedPrismaE2EEnvironment(profile, inheritedEnvironment)
    const prismaCommand = getPrismaE2ECommand(
      process.argv.slice(2),
      process.env.DARCY_E2E_MIGRATION_APPROVED,
    )

    run(process.execPath, ['-e', `require(${JSON.stringify(guardPath)}).getE2EEnvironmentIdentity()`], environment, repositoryRoot)

    const isolatedWorkingDirectory = mkdtempSync(join(tmpdir(), 'darcy-prisma-e2e-'))
    try {
      run(process.execPath, [...[prismaCliPath, ...prismaCommand], '--schema', schemaPath], environment, isolatedWorkingDirectory)
    } finally {
      rmSync(isolatedWorkingDirectory, { recursive: true, force: true })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível preparar o Prisma E2E.'
    console.error(`[DARCY Prisma E2E] ${message}`)
    process.exitCode = 1
  }
}

if (require.main === module) main()

module.exports = { run, timeoutFor, TIMEOUTS_MS }
