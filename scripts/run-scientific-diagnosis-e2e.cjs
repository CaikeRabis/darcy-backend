const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { spawnSync } = require('node:child_process')
const { parse } = require('dotenv')

const repositoryRoot = resolve(__dirname, '..')
const profile = parse(readFileSync(resolve(repositoryRoot, '.env.e2e.local')))
const { createIsolatedResumoHistoryE2EEnvironment } = require(resolve(repositoryRoot, 'dist/config/resumoHistoryE2eEnvironment.js'))
const { environment, apiBaseUrl } = createIsolatedResumoHistoryE2EEnvironment(profile, process.env)
environment.DARCY_E2E_API_BASE_URL = apiBaseUrl
environment.DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER = 'fake'
environment.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = 'enabled'
if (process.env.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED === 'enabled') environment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED = 'enabled'
const result = spawnSync(process.execPath, [resolve(repositoryRoot, 'dist/e2e/scientificDiagnosisPersistence.e2e.js')], { cwd: repositoryRoot, env: environment, stdio: 'inherit' })
process.exit(result.status ?? 1)
