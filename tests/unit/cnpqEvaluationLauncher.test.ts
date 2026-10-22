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

import { describe, expect, it } from 'vitest'
import { loadCnpqExperimentEnvironment } from '../../src/config/loadEnvironment'
import { resolveCnpqEvaluationLauncherConfiguration } from '../../src/experiments/cnpqEvaluation/launcher'

function evaluationEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    AI_PROVIDER: 'openai',
    OPENAI_MODEL: 'gpt-5.6-luna',
    OPENAI_API_KEY: 'openai-test-key',
    ...overrides,
  }
}

describe('carregamento controlado do launcher CNPq', () => {
  it('carrega somente .env da raiz do backend, sem expor a credencial', () => {
    const environment: NodeJS.ProcessEnv = {}
    let requestedFile = ''
    loadCnpqExperimentEnvironment('/repos/darcy-backend', environment, (filePath) => {
      requestedFile = filePath
      return 'OPENAI_API_KEY=openai-test-key\nAI_PROVIDER=openai\nOPENAI_MODEL=gpt-5.6-luna\n'
    })

    expect(requestedFile).toBe('/repos/darcy-backend/.env')
    expect(environment.OPENAI_API_KEY).toBe('openai-test-key')
    expect(environment.AI_PROVIDER).toBe('openai')
    expect(environment.OPENAI_MODEL).toBe('gpt-5.6-luna')
  })

  it('falha quando .env não está disponível', () => {
    expect(() => loadCnpqExperimentEnvironment('/repos/darcy-backend', {}, () => {
      throw new Error('arquivo ausente')
    })).toThrow('perfil local .env')
  })

  it('ignora DARCY_ENV_FILE e não carrega perfil E2E automaticamente', () => {
    const environment: NodeJS.ProcessEnv = { DARCY_ENV_FILE: '.env.e2e.local' }
    let requestedFile = ''
    loadCnpqExperimentEnvironment('/repos/darcy-backend', environment, (filePath) => {
      requestedFile = filePath
      return 'OPENAI_API_KEY=openai-test-key\nAI_PROVIDER=openai\nOPENAI_MODEL=gpt-5.6-luna\n'
    })

    expect(requestedFile).toBe('/repos/darcy-backend/.env')
    expect(environment.OPENAI_API_KEY).toBe('openai-test-key')
  })

  it('preserva uma credencial já injetada no processo', () => {
    const environment = evaluationEnvironment({ OPENAI_API_KEY: 'credential-from-secret-manager' })
    loadCnpqExperimentEnvironment('/repos/darcy-backend', environment, () => 'OPENAI_API_KEY=openai-test-key\nAI_PROVIDER=openai\nOPENAI_MODEL=gpt-5.6-luna\n')
    expect(environment.OPENAI_API_KEY).toBe('credential-from-secret-manager')
  })

  it('bloqueia divergência de provedor ou modelo', () => {
    expect(() => loadCnpqExperimentEnvironment('/repos/darcy-backend', evaluationEnvironment({ AI_PROVIDER: 'gemini' }), () => 'AI_PROVIDER=openai\nOPENAI_MODEL=gpt-5.6-luna\n'))
      .toThrow('AI_PROVIDER')
    expect(() => loadCnpqExperimentEnvironment('/repos/darcy-backend', evaluationEnvironment({ OPENAI_MODEL: 'outro-modelo' }), () => 'AI_PROVIDER=openai\nOPENAI_MODEL=gpt-5.6-luna\n'))
      .toThrow('OPENAI_MODEL')
  })

  it('bloqueia autorização de experimento presente em .env', () => {
    expect(() => loadCnpqExperimentEnvironment('/repos/darcy-backend', {}, () => 'RUN_REAL_AI_EXPERIMENTS=true\nOPENAI_API_KEY=openai-test-key\n'))
      .toThrow('RUN_REAL_AI_EXPERIMENTS')
  })
})

describe('configuração do launcher CNPq', () => {
  it('reconhece o piloto real somente com todas as confirmações explícitas', () => {
    const configuration = resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({
      RUN_REAL_AI_EXPERIMENTS: 'true',
      DARCY_EXPERIMENT_PLAN: 'pilot-6',
      DARCY_EXPERIMENT_CONFIRMATION: 'D3-CNPQ-PILOT-6',
      DARCY_EXPERIMENT_BUDGET_USD: '0.03',
    }))

    expect(configuration).toMatchObject({ execute: true, plan: 'pilot-6', budgetUsd: 0.03 })
  })

  it('bloqueia provedor, modelo, confirmação ou teto divergentes', () => {
    expect(() => resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({ AI_PROVIDER: 'gemini' }))).toThrow('AI_PROVIDER')
    expect(() => resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({ OPENAI_MODEL: 'outro-modelo' }))).toThrow('OPENAI_MODEL')
    expect(() => resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({
      RUN_REAL_AI_EXPERIMENTS: 'true', DARCY_EXPERIMENT_PLAN: 'pilot-6', DARCY_EXPERIMENT_BUDGET_USD: '0.03',
    }))).toThrow('confirmação específica')
    expect(() => resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({
      RUN_REAL_AI_EXPERIMENTS: 'true', DARCY_EXPERIMENT_PLAN: 'pilot-6', DARCY_EXPERIMENT_CONFIRMATION: 'D3-CNPQ-PILOT-6',
    }))).toThrow('teto financeiro explícito')
    expect(() => resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({
      RUN_REAL_AI_EXPERIMENTS: 'true', DARCY_EXPERIMENT_PLAN: 'pilot-6', DARCY_EXPERIMENT_CONFIRMATION: 'D3-CNPQ-PILOT-6', DARCY_EXPERIMENT_BUDGET_USD: '0.03', OPENAI_API_KEY: '',
    }))).toThrow('OPENAI_API_KEY')
    expect(() => resolveCnpqEvaluationLauncherConfiguration(evaluationEnvironment({ DARCY_EXPERIMENT_PLAN: 'plano-invalido' })))
      .toThrow('DARCY_EXPERIMENT_PLAN')
  })

  it('mantém dry-run sem exigir credencial ou iniciar transporte', () => {
    const configuration = resolveCnpqEvaluationLauncherConfiguration({ AI_PROVIDER: 'openai', OPENAI_MODEL: 'gpt-5.6-luna', DARCY_EXPERIMENT_PLAN: 'pilot-6' })
    expect(configuration).toMatchObject({ execute: false, plan: 'pilot-6' })
  })
})
