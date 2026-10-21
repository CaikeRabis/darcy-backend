const { mkdtempSync, readFileSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { parse } = require('dotenv')

const repositoryRoot = process.cwd()
const profilePath = resolve(repositoryRoot, '.env.e2e.local')
const guardPath = resolve(repositoryRoot, 'dist/config/e2eEnvironment.js')
const environmentFactoryPath = resolve(repositoryRoot, 'dist/config/prismaE2eEnvironment.js')
const prismaCliPath = require.resolve('prisma/build/index.js')
const schemaPath = resolve(repositoryRoot, 'prisma/schema.prisma')

function run(command, argumentsList, environment, workingDirectory) {
  const result = spawnSync(command, argumentsList, {
    cwd: workingDirectory,
    env: environment,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

try {
  const profile = parse(readFileSync(profilePath))
  const {
    createIsolatedPrismaE2EEnvironment,
    getPrismaE2ECommand,
  } = require(environmentFactoryPath)
  const environment = createIsolatedPrismaE2EEnvironment(profile, process.env)
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
  process.exit(1)
}
