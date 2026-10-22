import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  CnpqEvaluationRunner,
  D3_REFERENCE_BUDGET_USD,
  createOpenAIExperimentTransport,
  writeExperimentArtifacts,
} from '../src/experiments/cnpqEvaluation/runner'

const execute = process.env.RUN_REAL_AI_EXPERIMENTS === 'true'
const plan = process.env.DARCY_EXPERIMENT_PLAN === 'pilot-6' ? 'pilot-6' : 'full'
const expectedConfirmation = plan === 'pilot-6' ? 'D3-CNPQ-PILOT-6' : 'D3-CNPQ-72'
const optIn = execute && process.env.DARCY_EXPERIMENT_CONFIRMATION === expectedConfirmation
const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase() || 'gemini'
const configuredModel = process.env.OPENAI_MODEL?.trim() || 'gpt-5.6-luna'
if (execute && (configuredProvider !== 'openai' || configuredModel !== 'gpt-5.6-luna')) {
  throw new Error('Execução experimental requer AI_PROVIDER=openai e OPENAI_MODEL=gpt-5.6-luna.')
}
const transport = execute && optIn
  ? createOpenAIExperimentTransport()
  : { generate: async () => { throw new Error('Dry-run não deve chamar provedor.') } }

const runner = new CnpqEvaluationRunner(transport)
const configuredBudget = Number(process.env.DARCY_EXPERIMENT_BUDGET_USD ?? D3_REFERENCE_BUDGET_USD)
if (!Number.isFinite(configuredBudget) || configuredBudget <= 0) {
  throw new Error('DARCY_EXPERIMENT_BUDGET_USD deve ser um número positivo.')
}
if (execute && !process.env.DARCY_EXPERIMENT_BUDGET_USD) {
  throw new Error('Execução real requer teto financeiro explícito em DARCY_EXPERIMENT_BUDGET_USD.')
}
runner.run({
  mode: execute ? 'execute' : 'dry-run',
  optIn,
  budgetUsd: configuredBudget,
  plan,
  confirmation: process.env.DARCY_EXPERIMENT_CONFIRMATION,
})
  .then(async (records) => {
    const executionNamespace = `${execute ? 'real' : 'dry-run'}-${plan}-${Date.now()}-${randomUUID()}`
    await writeExperimentArtifacts(join(process.cwd(), 'experiments/results/d3-cnpq', executionNamespace), records, {
      plan,
      mode: execute ? 'execute' : 'dry-run',
      budgetUsd: configuredBudget,
      confirmationRequired: expectedConfirmation,
    })
    console.log(`D3 CNPq: ${records.length} registros (${execute ? 'execução' : 'dry-run'}).`)
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Falha desconhecida no runner experimental.'
    console.error(message)
    process.exitCode = 1
  })
