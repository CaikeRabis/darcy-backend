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
  resume?: ExperimentResumeArtifacts
  plan?: 'full' | 'pilot-6'
  confirmation?: string
}

export interface ExperimentArtifactOptions {
  plan: 'full' | 'pilot-6'
  mode: 'dry-run' | 'execute'
  budgetUsd: number
  confirmationRequired: string
}

export interface ExperimentManifest {
  experiment: 'D3-CNPQ'
  protocolVersion: 'D3-B3-R1'
  plan: 'full' | 'pilot-6'
  confirmationRequired: string
  plannedResponses: number
  abPairs: number
  repetitionsPerCondition: number
  provider: 'openai'
  model: string
  generationParameters: { temperature: number; topP: number; topK: number; maxOutputTokens: number }
  priceVersion: string
  budgetUsd: number
  estimatedReserveUsd: number
  mode: 'dry-run' | 'execute'
  status: 'simulated' | 'completed' | 'interrupted'
  generatedAt: string
}

export interface ExperimentResumeArtifacts {
  manifest: ExperimentManifest
  records: readonly ExperimentRecord[]
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
    const plan = options.plan ?? 'full'
    const confirmationRequired = plan === 'pilot-6' ? 'D3-CNPQ-PILOT-6' : 'D3-CNPQ-72'
    if (options.mode === 'execute' && options.confirmation !== confirmationRequired) {
      throw new Error('Execução experimental bloqueada: confirmação específica obrigatória.')
    }

    const records: ExperimentRecord[] = []
    let chargedUsd = 0
    const specs = plan === 'pilot-6' ? createPilotExperimentSpecs() : createExperimentSpecs()
    const firstRequest = specs[0]?.request
    if (!firstRequest) throw new Error('Plano experimental sem especificações.')
    const completedIds = options.resume
      ? getCompatibleCompletedIds(options.resume.manifest, options.resume.records, {
        plan,
        provider: 'openai',
        model: 'gpt-5.6-luna',
        priceVersion: D3_PRICE_VERSION,
        generationParameters: firstRequest.options,
        confirmationRequired,
      })
      : new Set<string>()
    for (const spec of specs) {
      const reservedUsd = estimateCost(estimateInputTokens(spec.request), MAX_OUTPUT_TOKENS)
      if (completedIds.has(spec.id)) {
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

export function createExperimentManifest(
  records: readonly ExperimentRecord[],
  options: ExperimentArtifactOptions,
): ExperimentManifest {
  const specs = options.plan === 'pilot-6' ? createPilotExperimentSpecs() : createExperimentSpecs()
  const firstRequest = specs[0]?.request
  if (!firstRequest) throw new Error('Plano experimental sem especificações.')
  const hasOnlyFinalRealStatuses = records.length === specs.length
    && records.every((record) => record.status === 'completed' || record.status === 'duplicate_skipped')
  return {
    experiment: 'D3-CNPQ',
    protocolVersion: 'D3-B3-R1',
    plan: options.plan,
    confirmationRequired: options.confirmationRequired,
    plannedResponses: specs.length,
    abPairs: specs.length / 2,
    repetitionsPerCondition: options.plan === 'pilot-6' ? 1 : 3,
    provider: 'openai',
    model: 'gpt-5.6-luna',
    generationParameters: firstRequest.options,
    priceVersion: D3_PRICE_VERSION,
    budgetUsd: options.budgetUsd,
    estimatedReserveUsd: Number(records.reduce((total, record) => total + record.reservedUsd, 0).toFixed(7)),
    mode: options.mode,
    status: options.mode === 'dry-run' ? 'simulated' : hasOnlyFinalRealStatuses ? 'completed' : 'interrupted',
    generatedAt: new Date().toISOString(),
  }
}

export function getCompatibleCompletedIds(
  manifest: ExperimentManifest,
  records: readonly ExperimentRecord[],
  expected: Pick<ExperimentManifest, 'plan' | 'provider' | 'model' | 'priceVersion' | 'generationParameters' | 'confirmationRequired'>,
): ReadonlySet<string> {
  if (manifest.mode !== 'execute') return new Set()
  const sameGenerationParameters = manifest.generationParameters.temperature === expected.generationParameters.temperature
    && manifest.generationParameters.topP === expected.generationParameters.topP
    && manifest.generationParameters.topK === expected.generationParameters.topK
    && manifest.generationParameters.maxOutputTokens === expected.generationParameters.maxOutputTokens
  if (
    manifest.plan !== expected.plan
    || manifest.provider !== expected.provider
    || manifest.model !== expected.model
    || manifest.priceVersion !== expected.priceVersion
    || manifest.confirmationRequired !== expected.confirmationRequired
    || !sameGenerationParameters
  ) return new Set()
  return new Set(records.filter((record) => record.status === 'completed').map((record) => record.id))
}

export async function writeExperimentArtifacts(
  outputDirectory: string,
  records: readonly ExperimentRecord[],
  options: ExperimentArtifactOptions,
): Promise<void> {
  await mkdir(outputDirectory, { recursive: true })
  const manifest = createExperimentManifest(records, options)
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
