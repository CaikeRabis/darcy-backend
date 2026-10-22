import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CnpqEvaluationRunner,
  createExperimentSpecs,
  createExperimentManifest,
  createPilotExperimentSpecs,
  D3_PILOT_MAX_CALLS,
  getCompatibleCompletedIds,
  writeExperimentArtifacts,
  type ExperimentTransport,
} from '../../src/experiments/cnpqEvaluation/runner'

function transportWithUsage(inputTokens = 100, outputTokens = 50): ExperimentTransport {
  return {
    generate: vi.fn().mockResolvedValue({
      outputText: '{"mensagem":"Sintética"}',
      usage: { inputTokens, outputTokens },
      completion: 'completed',
    }),
  }
}

describe('runner experimental CNPq D3', () => {
  it('cria 72 pares A/B comparáveis, sem classificação em A e com classificação em B', () => {
    const specs = createExperimentSpecs()
    expect(specs).toHaveLength(72)
    const educationA = specs.find((item) => item.id === 'D3-educacao-formacao-docente-A-r1')
    const educationB = specs.find((item) => item.id === 'D3-educacao-formacao-docente-B-r1')
    expect(educationA?.request.prompt).toBe(educationB?.request.prompt)
    expect(educationA?.request.systemInstruction).not.toContain('Classificação CNPq confirmada')
    expect(educationB?.request.systemInstruction).toContain('Classificação CNPq confirmada')
  })

  it('limita o piloto a três pares A/B sintéticos, sem as demais 66 especificações', () => {
    const specs = createPilotExperimentSpecs()
    expect(specs).toHaveLength(D3_PILOT_MAX_CALLS)
    expect(specs.every((spec) => spec.repetition === 1)).toBe(true)
    expect(new Set(specs.map((spec) => spec.scenario.id))).toHaveLength(3)
    expect(specs.filter((spec) => spec.condition === 'A')).toHaveLength(3)
    expect(specs.filter((spec) => spec.condition === 'B')).toHaveLength(3)
  })

  it('executa dry-run sem chamar o transporte', async () => {
    const transport = transportWithUsage()
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'dry-run', optIn: false, budgetUsd: 0.30 })
    expect(records).toHaveLength(72)
    expect(records.every((record) => record.status === 'dry_run')).toBe(true)
    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('bloqueia execução real sem opt-in', async () => {
    await expect(new CnpqEvaluationRunner(transportWithUsage()).run({ mode: 'execute', optIn: false, budgetUsd: 0.30 }))
      .rejects.toThrow('opt-in explícito obrigatório')
  })

  it('bloqueia piloto com confirmação ausente ou incorreta antes do transporte', async () => {
    const transport = transportWithUsage()
    await expect(new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, plan: 'pilot-6' }))
      .rejects.toThrow('confirmação específica obrigatória')
    await expect(new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, plan: 'pilot-6', confirmation: 'D3-CNPQ-72' }))
      .rejects.toThrow('confirmação específica obrigatória')
    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('bloqueia o plano completo sem a confirmação específica antes do transporte', async () => {
    const transport = transportWithUsage()
    await expect(new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30 }))
      .rejects.toThrow('confirmação específica obrigatória')
    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('executa no máximo seis chamadas no piloto confirmado', async () => {
    const transport = transportWithUsage()
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, plan: 'pilot-6', confirmation: 'D3-CNPQ-PILOT-6' })
    expect(records).toHaveLength(6)
    expect(transport.generate).toHaveBeenCalledTimes(6)
  })

  it('reserva orçamento antes da chamada e interrompe ao atingir o teto', async () => {
    const transport = transportWithUsage()
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.0001, confirmation: 'D3-CNPQ-72' })
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('budget_blocked')
    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('interrompe com segurança se o provider não retorna usage', async () => {
    const transport: ExperimentTransport = {
      generate: vi.fn().mockResolvedValue({
        outputText: '{}', usage: { inputTokens: null, outputTokens: null }, completion: 'completed',
      }),
    }
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, confirmation: 'D3-CNPQ-72' })
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('missing_usage')
    expect(records[0].chargedUsd).toBe(records[0].reservedUsd)
  })

  it.each(['timeout', 'rate limit', 'authentication', 'network'])('contabiliza falha incerta de %s de modo conservador', async () => {
    const transport: ExperimentTransport = { generate: vi.fn().mockRejectedValue(new Error('falha simulada')) }
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, confirmation: 'D3-CNPQ-72' })
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('uncertain_charge')
    expect(records[0].chargedUsd).toBe(records[0].reservedUsd)
  })

  it.each([
    ['JSON inválido', '{', 'invalid_json'],
    ['campo obrigatório ausente', '{}', 'invalid_contract'],
    ['tipo incompatível', '{"mensagem":42}', 'invalid_contract'],
  ] as const)('recusa %s e interrompe antes da próxima especificação', async (_label, outputText, validationFailure) => {
    const transport: ExperimentTransport = {
      generate: vi.fn().mockResolvedValue({
        outputText,
        usage: { inputTokens: 100, outputTokens: 50 },
        completion: 'completed',
      }),
    }

    const records = await new CnpqEvaluationRunner(transport).run({
      mode: 'execute', optIn: true, budgetUsd: 0.03, plan: 'pilot-6', confirmation: 'D3-CNPQ-PILOT-6',
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'invalid_response', validationFailure })
    expect(records[0].chargedUsd).toBeCloseTo(0.00008, 10)
    expect(transport.generate).toHaveBeenCalledOnce()
  })

  it.each([
    ['incompleta', 'incomplete', '{"mensagem":"parcial"}', 'incomplete_response'],
    ['recusada', 'refused', null, 'model_refusal'],
    ['vazia', 'completed', null, 'incomplete_response'],
  ] as const)('interrompe sem retry quando a resposta é %s', async (_label, completion, outputText, validationFailure) => {
    const transport: ExperimentTransport = {
      generate: vi.fn().mockResolvedValue({
        outputText,
        usage: { inputTokens: 100, outputTokens: 50 },
        completion,
      }),
    }

    const records = await new CnpqEvaluationRunner(transport).run({
      mode: 'execute', optIn: true, budgetUsd: 0.03, plan: 'pilot-6', confirmation: 'D3-CNPQ-PILOT-6',
    })

    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ status: 'invalid_response', validationFailure })
    expect(transport.generate).toHaveBeenCalledOnce()
  })

  it('não reexecuta respostas concluídas ao retomar com artefatos reais compatíveis', async () => {
    const transport = transportWithUsage()
    const completedRecord = {
      id: createExperimentSpecs()[0].id, scenarioId: 'educacao-formacao-docente', condition: 'A' as const, repetition: 1,
      status: 'completed' as const, reservedUsd: 0.01, chargedUsd: 0.001, model: 'gpt-5.6-luna' as const,
    }
    const interruptedManifest = createExperimentManifest([completedRecord], { plan: 'full', mode: 'execute', budgetUsd: 0.30, confirmationRequired: 'D3-CNPQ-72' })
    const records = await new CnpqEvaluationRunner(transport).run({
      mode: 'execute', optIn: true, budgetUsd: 0.30, confirmation: 'D3-CNPQ-72',
      resume: { manifest: interruptedManifest, records: [completedRecord] },
    })
    expect(records[0].status).toBe('duplicate_skipped')
    expect(transport.generate).toHaveBeenCalledTimes(71)
  })

  it('gera artefatos cegos isolados, sem expor a condição na resposta avaliada', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'darcy-d3-'))
    try {
      const records = [{
        id: 'D3-cenario-B-r1', scenarioId: 'cenario', condition: 'B', repetition: 1,
        status: 'completed', reservedUsd: 0.01, chargedUsd: 0.001, model: 'gpt-5.6-luna', outputText: 'Resposta sintética.',
      }] as const
      await writeExperimentArtifacts(directory, records, { plan: 'pilot-6', mode: 'execute', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' })
      const blind = await readFile(join(directory, 'blind-responses.ndjson'), 'utf8')
      const key = await readFile(join(directory, 'blind-key.json'), 'utf8')
      expect(blind).not.toContain('"condition"')
      expect(blind).toContain('Resposta sintética.')
      expect(key).toContain('"condition": "B"')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('registra manifestos distintos para piloto e experimento completo', () => {
    const pilot = createExperimentManifest([], { plan: 'pilot-6', mode: 'dry-run', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' })
    const full = createExperimentManifest([], { plan: 'full', mode: 'dry-run', budgetUsd: 0.30, confirmationRequired: 'D3-CNPQ-72' })
    expect(pilot).toMatchObject({ plan: 'pilot-6', plannedResponses: 6, abPairs: 3, repetitionsPerCondition: 1, mode: 'dry-run', status: 'simulated' })
    expect(full).toMatchObject({ plan: 'full', plannedResponses: 72, abPairs: 36, repetitionsPerCondition: 3 })
    expect(pilot).toMatchObject({
      protocolVersion: 'D3-B3-R3',
      conceptualGenerationParameters: expect.objectContaining({ temperature: 0.2, topP: 0.8, topK: 40 }),
      effectiveGenerationParameters: expect.objectContaining({
        temperature: 0.2, maxOutputTokens: 2048, reasoningEffort: 'none', store: false, responseFormat: 'json_schema', responseSchemaStrict: false,
      }),
      declaredButNotAppliedParameters: { topP: 0.8, topK: 40 },
    })
    expect(pilot.effectiveGenerationParameters).not.toHaveProperty('topP')
    expect(pilot.effectiveGenerationParameters).not.toHaveProperty('topK')
    expect(pilot).not.toHaveProperty('apiKey')
    expect(JSON.stringify(pilot)).not.toMatch(/"(?:api[_-]?key|authorization|secret|password)"\s*:/i)
  })

  it('não considera registros dry-run como respostas concluídas ou respostas cegas', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'darcy-d3-dry-'))
    try {
      const records = await new CnpqEvaluationRunner(transportWithUsage()).run({ mode: 'dry-run', optIn: false, budgetUsd: 0.03, plan: 'pilot-6' })
      await writeExperimentArtifacts(directory, records, { plan: 'pilot-6', mode: 'dry-run', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' })
      const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')) as { status: string; mode: string }
      expect(manifest).toMatchObject({ mode: 'dry-run', status: 'simulated' })
      expect(createExperimentManifest(records, { plan: 'pilot-6', mode: 'dry-run', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' }).estimatedReserveUsd).toBe(0.0164754)
      expect(await readFile(join(directory, 'blind-responses.ndjson'), 'utf8')).toBe('\n')
      expect(getCompatibleCompletedIds(createExperimentManifest(records, { plan: 'pilot-6', mode: 'dry-run', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' }), records, createExperimentManifest(records, { plan: 'pilot-6', mode: 'dry-run', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' }))).toEqual(new Set())
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('permite retomada apenas de execução real completa e compatível', async () => {
    const records = await new CnpqEvaluationRunner(transportWithUsage()).run({ mode: 'execute', optIn: true, budgetUsd: 0.03, plan: 'pilot-6', confirmation: 'D3-CNPQ-PILOT-6' })
    const real = createExperimentManifest(records, { plan: 'pilot-6', mode: 'execute', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' })
    expect(real.status).toBe('completed')
    expect(getCompatibleCompletedIds(real, records, real)).toEqual(new Set(records.map((record) => record.id)))
    expect(getCompatibleCompletedIds(real, records, { ...real, plan: 'full' })).toEqual(new Set())
    expect(getCompatibleCompletedIds(real, records, { ...real, model: 'modelo-incompativel' })).toEqual(new Set())
    expect(getCompatibleCompletedIds(real, records, {
      ...real,
      declaredButNotAppliedParameters: { ...real.declaredButNotAppliedParameters, topP: 0.7 },
    })).toEqual(new Set())
    expect(getCompatibleCompletedIds({ ...real, protocolVersion: 'D3-B3-R1' }, records, real)).toEqual(new Set())
  })

  it('retoma somente os registros concluídos de execução real interrompida', () => {
    const incomplete = [{
      id: 'D3-x-A-r1', scenarioId: 'cenario', condition: 'A' as const, repetition: 1,
      status: 'completed' as const, reservedUsd: 0.01, chargedUsd: 0.001, model: 'gpt-5.6-luna' as const,
    }, {
      id: 'D3-x-B-r1', scenarioId: 'cenario', condition: 'B' as const, repetition: 1,
      status: 'budget_blocked' as const, reservedUsd: 0.01, chargedUsd: 0, model: 'gpt-5.6-luna' as const,
    }]
    const manifest = createExperimentManifest(incomplete, { plan: 'pilot-6', mode: 'execute', budgetUsd: 0.03, confirmationRequired: 'D3-CNPQ-PILOT-6' })
    expect(manifest.status).toBe('interrupted')
    expect(getCompatibleCompletedIds(manifest, incomplete, manifest)).toEqual(new Set(['D3-x-A-r1']))
  })
})
