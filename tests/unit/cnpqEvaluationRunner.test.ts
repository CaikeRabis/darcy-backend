import { describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  CnpqEvaluationRunner,
  createExperimentSpecs,
  createPilotExperimentSpecs,
  D3_PILOT_MAX_CALLS,
  writeExperimentArtifacts,
  type ExperimentTransport,
} from '../../src/experiments/cnpqEvaluation/runner'

function transportWithUsage(inputTokens = 100, outputTokens = 50): ExperimentTransport {
  return { generate: vi.fn().mockResolvedValue({ outputText: '{"mensagem":"Sintética"}', usage: { inputTokens, outputTokens } }) }
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

  it('executa no máximo seis chamadas no piloto confirmado', async () => {
    const transport = transportWithUsage()
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, plan: 'pilot-6', confirmation: 'D3-CNPQ-PILOT-6' })
    expect(records).toHaveLength(6)
    expect(transport.generate).toHaveBeenCalledTimes(6)
  })

  it('reserva orçamento antes da chamada e interrompe ao atingir o teto', async () => {
    const transport = transportWithUsage()
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.0001 })
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('budget_blocked')
    expect(transport.generate).not.toHaveBeenCalled()
  })

  it('interrompe com segurança se o provider não retorna usage', async () => {
    const transport: ExperimentTransport = { generate: vi.fn().mockResolvedValue({ outputText: '{}', usage: { inputTokens: null, outputTokens: null } }) }
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30 })
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('missing_usage')
    expect(records[0].chargedUsd).toBe(records[0].reservedUsd)
  })

  it.each(['timeout', 'rate limit', 'authentication', 'network'])('contabiliza falha incerta de %s de modo conservador', async () => {
    const transport: ExperimentTransport = { generate: vi.fn().mockRejectedValue(new Error('falha simulada')) }
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30 })
    expect(records).toHaveLength(1)
    expect(records[0].status).toBe('uncertain_charge')
    expect(records[0].chargedUsd).toBe(records[0].reservedUsd)
  })

  it('não reexecuta respostas concluídas ao retomar', async () => {
    const transport = transportWithUsage()
    const firstId = createExperimentSpecs()[0].id
    const records = await new CnpqEvaluationRunner(transport).run({ mode: 'execute', optIn: true, budgetUsd: 0.30, completedIds: new Set([firstId]) })
    expect(records[0].status).toBe('duplicate_skipped')
    expect(transport.generate).toHaveBeenCalledTimes(71)
  })

  it('gera artefatos cegos isolados, sem expor a condição na resposta avaliada', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'darcy-d3-'))
    try {
      await writeExperimentArtifacts(directory, [{
        id: 'D3-cenario-B-r1', scenarioId: 'cenario', condition: 'B', repetition: 1,
        status: 'completed', reservedUsd: 0.01, chargedUsd: 0.001, model: 'gpt-5.6-luna', outputText: 'Resposta sintética.',
      }])
      const blind = await readFile(join(directory, 'blind-responses.ndjson'), 'utf8')
      const key = await readFile(join(directory, 'blind-key.json'), 'utf8')
      expect(blind).not.toContain('"condition"')
      expect(blind).toContain('Resposta sintética.')
      expect(key).toContain('"condition": "B"')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
