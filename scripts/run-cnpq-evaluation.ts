import { randomUUID } from 'node:crypto'
import { join, resolve } from 'node:path'
import { loadCnpqExperimentEnvironment } from '../src/config/loadEnvironment'
import {
  CnpqEvaluationRunner,
  createOpenAIExperimentTransport,
  writeExperimentArtifacts,
} from '../src/experiments/cnpqEvaluation/runner'
import { resolveCnpqEvaluationLauncherConfiguration } from '../src/experiments/cnpqEvaluation/launcher'

const repositoryRoot = resolve(__dirname, '..')
loadCnpqExperimentEnvironment(repositoryRoot)
const configuration = resolveCnpqEvaluationLauncherConfiguration()
const transport = configuration.execute
  ? createOpenAIExperimentTransport()
  : { generate: async () => { throw new Error('Dry-run não deve chamar provedor.') } }

const runner = new CnpqEvaluationRunner(transport)
runner.run({
  mode: configuration.execute ? 'execute' : 'dry-run',
  optIn: configuration.execute,
  budgetUsd: configuration.budgetUsd,
  plan: configuration.plan,
  confirmation: configuration.confirmation,
})
  .then(async (records) => {
    const executionNamespace = `${configuration.execute ? 'real' : 'dry-run'}-${configuration.plan}-${Date.now()}-${randomUUID()}`
    await writeExperimentArtifacts(join(repositoryRoot, 'experiments/results/d3-cnpq', executionNamespace), records, {
      plan: configuration.plan,
      mode: configuration.execute ? 'execute' : 'dry-run',
      budgetUsd: configuration.budgetUsd,
      confirmationRequired: configuration.confirmationRequired,
    })
    console.log(`D3 CNPq: ${records.length} registros (${configuration.execute ? 'execução' : 'dry-run'}).`)
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no runner experimental.'
    console.error(message)
    process.exitCode = 1
  })
