const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { parse } = require('dotenv')

const repositoryRoot = resolve(__dirname, '..')
const profilePath = resolve(repositoryRoot, '.env.e2e.local')
const environmentFactoryPath = resolve(repositoryRoot, 'dist/config/resumoHistoryE2eEnvironment.js')
const testPath = resolve(repositoryRoot, 'dist/e2e/resumoAcademicoTextVersions.e2e.js')

try {
  if (process.argv.length !== 2) throw new Error('O launcher E2E de versões textuais não aceita argumentos adicionais.')

  const profile = parse(readFileSync(profilePath))
  const { createIsolatedResumoHistoryE2EEnvironment } = require(environmentFactoryPath)
  const { environment, apiBaseUrl } = createIsolatedResumoHistoryE2EEnvironment(profile, process.env)
  environment.DARCY_E2E_API_BASE_URL = apiBaseUrl

  const result = spawnSync(process.execPath, [testPath], {
    cwd: repositoryRoot,
    env: environment,
    stdio: 'inherit',
  })

  process.exit(result.status ?? 1)
} catch (error) {
  const message = error instanceof Error ? error.message : 'Não foi possível preparar o teste E2E de versões textuais.'
  console.error(`[DARCY E2E versões textuais] ${message}`)
  process.exit(1)
}
