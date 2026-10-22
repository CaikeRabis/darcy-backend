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

import { D3_REFERENCE_BUDGET_USD } from './runner'

export interface CnpqEvaluationLauncherConfiguration {
  execute: boolean
  plan: 'full' | 'pilot-6'
  confirmation: string | undefined
  confirmationRequired: string
  budgetUsd: number
}

export function resolveCnpqEvaluationLauncherConfiguration(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): CnpqEvaluationLauncherConfiguration {
  const execute = environmentVariables.RUN_REAL_AI_EXPERIMENTS === 'true'
  const configuredPlan = environmentVariables.DARCY_EXPERIMENT_PLAN?.trim() || 'full'
  if (configuredPlan !== 'full' && configuredPlan !== 'pilot-6') {
    throw new Error('DARCY_EXPERIMENT_PLAN deve ser "full" ou "pilot-6".')
  }

  const configuredProvider = environmentVariables.AI_PROVIDER?.trim().toLowerCase()
  const configuredModel = environmentVariables.OPENAI_MODEL?.trim()
  if (configuredProvider !== 'openai' || configuredModel !== 'gpt-5.6-luna') {
    throw new Error('Execução experimental requer AI_PROVIDER=openai e OPENAI_MODEL=gpt-5.6-luna.')
  }

  const configuredBudget = environmentVariables.DARCY_EXPERIMENT_BUDGET_USD
  const budgetUsd = Number(configuredBudget ?? D3_REFERENCE_BUDGET_USD)
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    throw new Error('DARCY_EXPERIMENT_BUDGET_USD deve ser um número positivo.')
  }
  if (execute && !configuredBudget) {
    throw new Error('Execução real requer teto financeiro explícito em DARCY_EXPERIMENT_BUDGET_USD.')
  }

  const confirmationRequired = configuredPlan === 'pilot-6' ? 'D3-CNPQ-PILOT-6' : 'D3-CNPQ-72'
  const confirmation = environmentVariables.DARCY_EXPERIMENT_CONFIRMATION
  if (execute && confirmation !== confirmationRequired) {
    throw new Error('Execução experimental bloqueada: confirmação específica obrigatória.')
  }
  if (execute && !environmentVariables.OPENAI_API_KEY?.trim()) {
    throw new Error('OPENAI_API_KEY é obrigatória para a execução experimental real.')
  }

  return { execute, plan: configuredPlan, confirmation, confirmationRequired, budgetUsd }
}
