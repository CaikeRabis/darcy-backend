/**
 * Projeto: DARCY — Sistema Inteligente de Orientação Científica
 *
 * Autor: Caike Carvalho Rabis
 *
 * Titular dos direitos patrimoniais: Escrita com Ciência
 *
 * Copyright (c) 2026 Escrita com Ciência.
 *
 * Todos os direitos reservados.
 *
 * Consulte NOTICE.txt para informações de titularidade.
 */


import { config, parse } from 'dotenv'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_ENVIRONMENT_FILE = '.env'
const E2E_ENVIRONMENT_FILE = '.env.e2e.local'
const CNPQ_EXPERIMENT_ENVIRONMENT_FILE = '.env'
const CNPQ_EXPERIMENT_FILE_VARIABLES = ['OPENAI_API_KEY', 'AI_PROVIDER', 'OPENAI_MODEL'] as const
const CNPQ_EXPERIMENT_AUTHORIZATION_VARIABLES = [
  'RUN_REAL_AI_EXPERIMENTS',
  'DARCY_EXPERIMENT_PLAN',
  'DARCY_EXPERIMENT_CONFIRMATION',
  'DARCY_EXPERIMENT_BUDGET_USD',
] as const

type EnvironmentFileReader = (filePath: string) => string

function readUtf8File(filePath: string): string {
  return readFileSync(filePath, 'utf8')
}

export function resolveEnvironmentFile(environmentVariables: NodeJS.ProcessEnv = process.env): string {
  const environmentFile = environmentVariables.DARCY_ENV_FILE?.trim() || DEFAULT_ENVIRONMENT_FILE

  if (environmentFile !== DEFAULT_ENVIRONMENT_FILE && environmentFile !== E2E_ENVIRONMENT_FILE) {
    throw new Error('DARCY_ENV_FILE inválido. Use .env ou .env.e2e.local.')
  }

  return environmentFile
}

export function loadRuntimeEnvironment(): void {
  const environmentFile = resolveEnvironmentFile()
  const result = config({ path: environmentFile, override: true })

  if (result.error) {
    throw new Error(`Não foi possível carregar o perfil de ambiente ${environmentFile}.`)
  }

  if (environmentFile === E2E_ENVIRONMENT_FILE && process.env.DARCY_E2E_GUARD !== 'enabled') {
    throw new Error('O perfil E2E exige DARCY_E2E_GUARD=enabled.')
  }
}

/**
 * Carrega somente as variáveis de configuração do experimento a partir do
 * perfil padrão do backend. A autorização de consumo permanece no processo.
 */
export function loadCnpqExperimentEnvironment(
  repositoryRoot: string,
  environmentVariables: NodeJS.ProcessEnv = process.env,
  readEnvironmentFile: EnvironmentFileReader = readUtf8File,
): void {
  const environmentFile = resolve(repositoryRoot, CNPQ_EXPERIMENT_ENVIRONMENT_FILE)
  let fileVariables: Record<string, string>

  try {
    fileVariables = parse(readEnvironmentFile(environmentFile))
  } catch {
    throw new Error('Não foi possível carregar o perfil local .env do experimento CNPq.')
  }

  for (const variable of CNPQ_EXPERIMENT_AUTHORIZATION_VARIABLES) {
    if (fileVariables[variable] !== undefined) {
      throw new Error(`A autorização experimental deve ser fornecida pelo processo, não por .env: ${variable}.`)
    }
  }

  for (const variable of CNPQ_EXPERIMENT_FILE_VARIABLES) {
    const processValue = environmentVariables[variable]?.trim()
    const fileValue = fileVariables[variable]?.trim()

    if ((variable === 'AI_PROVIDER' || variable === 'OPENAI_MODEL') && processValue && fileValue && processValue !== fileValue) {
      throw new Error(`Configuração experimental divergente para ${variable}.`)
    }

    if (!processValue && fileValue) {
      environmentVariables[variable] = fileValue
    }
  }
}
