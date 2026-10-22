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

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AIGenerationRequest } from '../../services/ai/contracts'
import { createDarcyChatGenerationRequest } from '../../services/ai/AIService'
import { OpenAIProvider } from '../../services/ai/providers/openai.provider'
import { getScenarioOwnedContext, SCIENTIFIC_SCENARIOS, type ScientificScenario } from './scenarios'

export const D3_PRICE_VERSION = 'openai-gpt-5.6-luna-2026-10-22'
export const D3_REFERENCE_BUDGET_USD = 0.30
export const D3_PILOT_MAX_CALLS = 6
export const D3_PILOT_SCENARIO_IDS = [
  'educacao-formacao-docente',
  'computacao-governanca-dados',
  'interdisciplinar-saude-decisao',
] as const
const INPUT_USD_PER_TOKEN = 0.20 / 1_000_000
const OUTPUT_USD_PER_TOKEN = 1.20 / 1_000_000
const MAX_OUTPUT_TOKENS = 2048

export type ExperimentCondition = 'A' | 'B'
export type ExperimentStatus = 'dry_run' | 'completed' | 'budget_blocked' | 'uncertain_charge' | 'missing_usage' | 'duplicate_skipped'

export interface ExperimentSpec {
  id: string
  scenario: ScientificScenario
  condition: ExperimentCondition
  repetition: 1 | 2 | 3
  request: AIGenerationRequest
}

export interface ExperimentUsage {
  inputTokens: number | null
  outputTokens: number | null
}

export interface ExperimentTransport {
  generate(request: AIGenerationRequest): Promise<{ outputText: string; usage: ExperimentUsage }>
}

export interface ExperimentRecord {
  id: string
  scenarioId: string
  condition: ExperimentCondition
  repetition: number
  status: ExperimentStatus
  reservedUsd: number
  chargedUsd: number
  model: 'gpt-5.6-luna'
  outputText?: string
}

export interface ExperimentRunOptions {
  mode: 'dry-run' | 'execute'
  optIn: boolean
  budgetUsd: number
  completedIds?: ReadonlySet<string>
  plan?: 'full' | 'pilot-6'
  confirmation?: string
}

function estimateInputTokens(request: AIGenerationRequest): number {
  const characters = request.systemInstruction.length + request.prompt.length + request.history.reduce((total, item) => total + item.content.length, 0)
  return Math.ceil(characters / 2)
}

function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN
}

export function createExperimentSpecs(): ExperimentSpec[] {
  return SCIENTIFIC_SCENARIOS.flatMap((scenario) => (['A', 'B'] as const).flatMap((condition) => ([1, 2, 3] as const).map((repetition) => {
    const owned = getScenarioOwnedContext(scenario)
    const context = {
      projectTitle: scenario.titulo,
      projectType: 'resumo-academico' as const,
      currentPhase: 'tema' as const,
      ...(owned.decisaoAutoralContextual ? { decisaoAutoralContextual: owned.decisaoAutoralContextual } : {}),
      ...(condition === 'B' && owned.classificacaoCnpqContextual ? { classificacaoCnpqContextual: owned.classificacaoCnpqContextual } : {}),
    }
    return {
      id: `D3-${scenario.id}-${condition}-r${repetition}`,
      scenario,
      condition,
      repetition,
      request: createDarcyChatGenerationRequest(context, scenario.instrucao),
    }
  })))
}

/** Três pares sintéticos A/B, uma única repetição por par. */
export function createPilotExperimentSpecs(): ExperimentSpec[] {
  const selected = new Set<string>(D3_PILOT_SCENARIO_IDS)
  const specs = createExperimentSpecs().filter(
    (spec) => selected.has(spec.scenario.id) && spec.repetition === 1,
  )
  if (specs.length !== D3_PILOT_MAX_CALLS) {
    throw new Error('Configuração inválida: piloto deve conter exatamente seis chamadas.')
  }
  return specs
}

export class CnpqEvaluationRunner {
  constructor(private readonly transport: ExperimentTransport) {}

  async run(options: ExperimentRunOptions): Promise<ExperimentRecord[]> {
    if (options.mode === 'execute' && !options.optIn) {
      throw new Error('Execução real bloqueada: opt-in explícito obrigatório.')
    }
    if (options.mode === 'execute' && options.plan === 'pilot-6' && options.confirmation !== 'D3-CNPQ-PILOT-6') {
      throw new Error('Execução piloto bloqueada: confirmação específica obrigatória.')
    }

    const records: ExperimentRecord[] = []
    let chargedUsd = 0
    const specs = options.plan === 'pilot-6' ? createPilotExperimentSpecs() : createExperimentSpecs()
    for (const spec of specs) {
      const reservedUsd = estimateCost(estimateInputTokens(spec.request), MAX_OUTPUT_TOKENS)
      if (options.completedIds?.has(spec.id)) {
        records.push({ ...toRecord(spec, 'duplicate_skipped', reservedUsd, 0) })
        continue
      }
      if (options.mode === 'dry-run') {
        records.push(toRecord(spec, 'dry_run', reservedUsd, 0))
        continue
      }
      if (chargedUsd + reservedUsd > options.budgetUsd) {
        records.push(toRecord(spec, 'budget_blocked', reservedUsd, 0))
        break
      }
      try {
        const result = await this.transport.generate(spec.request)
        if (result.usage.inputTokens === null || result.usage.outputTokens === null) {
          chargedUsd += reservedUsd
          records.push(toRecord(spec, 'missing_usage', reservedUsd, reservedUsd))
          break
        }
        const actualCost = estimateCost(result.usage.inputTokens, result.usage.outputTokens)
        chargedUsd += actualCost
        records.push({ ...toRecord(spec, 'completed', reservedUsd, actualCost), outputText: result.outputText })
      } catch {
        chargedUsd += reservedUsd
        records.push(toRecord(spec, 'uncertain_charge', reservedUsd, reservedUsd))
        break
      }
    }
    return records
  }
}

function toRecord(spec: ExperimentSpec, status: ExperimentStatus, reservedUsd: number, chargedUsd: number): ExperimentRecord {
  return { id: spec.id, scenarioId: spec.scenario.id, condition: spec.condition, repetition: spec.repetition, status, reservedUsd, chargedUsd, model: 'gpt-5.6-luna' }
}

/** Cria o transporte real somente quando o runner já passou pelo opt-in. */
export function createOpenAIExperimentTransport(): ExperimentTransport {
  const provider = new OpenAIProvider()
  return {
    async generate(request) {
      const result = await provider.generateWithUsage(request)
      return { outputText: result.outputText, usage: { inputTokens: result.inputTokens, outputTokens: result.outputTokens } }
    },
  }
}

export async function writeExperimentArtifacts(outputDirectory: string, records: readonly ExperimentRecord[]): Promise<void> {
  await mkdir(outputDirectory, { recursive: true })
  const manifest = { experiment: 'D3-CNPQ', priceVersion: D3_PRICE_VERSION, plannedResponses: 72, generatedAt: new Date().toISOString() }
  const blind = records.filter((record) => record.status === 'completed').map((record) => ({ id: blindId(record.id), resposta: record.outputText ?? '' }))
  const key = records.filter((record) => record.status === 'completed').map((record) => ({ id: blindId(record.id), experimentId: record.id, condition: record.condition }))
  await Promise.all([
    writeFile(join(outputDirectory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    writeFile(join(outputDirectory, 'responses.ndjson'), records.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8'),
    writeFile(join(outputDirectory, 'blind-responses.ndjson'), blind.map((record) => JSON.stringify(record)).join('\n') + '\n', 'utf8'),
    writeFile(join(outputDirectory, 'blind-key.json'), `${JSON.stringify(key, null, 2)}\n`, 'utf8'),
  ])
}

function blindId(id: string): string {
  return `R-${createHash('sha256').update(id).digest('hex').slice(0, 12)}`
}
