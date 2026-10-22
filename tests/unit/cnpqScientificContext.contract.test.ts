import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AIProvider } from '../../src/services/ai/provider'
import type { AIGenerationRequest } from '../../src/services/ai/contracts'
import { ClassificacaoCnpqSchema } from '../../src/schemas/resumoAcademico.schema'
import { AIService } from '../../src/services/ai/AIService'
import {
  getScenarioClassification,
  getScenarioOwnedContext,
  SCIENTIFIC_SCENARIOS,
} from '../fixtures/cnpqScientificScenarios'

const generate = vi.fn<AIProvider['generate']>()

vi.mock('../../src/services/ai/providerFactory', () => ({
  getAIProvider: (): AIProvider => ({
    name: 'openai',
    model: 'mock-deterministico',
    generate,
  }),
}))

const baseContext = {
  projectType: 'resumo-academico' as const,
  currentPhase: 'tema' as const,
}

describe('contrato científico CNPq D2 sem provedor real', () => {
  const service = AIService.getInstance()

  beforeEach(() => {
    generate.mockReset()
    generate.mockResolvedValue('{"mensagem":"Resposta simulada."}')
  })

  it('mantém os doze cenários da matriz e resolve somente identificadores oficiais', () => {
    expect(SCIENTIFIC_SCENARIOS).toHaveLength(12)

    for (const scenario of SCIENTIFIC_SCENARIOS) {
      const classification = getScenarioClassification(scenario)
      if (!classification) {
        expect(scenario.id).toBe('legado-sem-classificacao')
        continue
      }

      expect(ClassificacaoCnpqSchema.safeParse(classification).success).toBe(true)
      expect(classification.primaria.caminho_codigos.at(-1)).toBe(classification.primaria.codigo)
      expect(classification.correlatas?.every((entry) => entry.caminho_codigos.at(-1) === entry.codigo) ?? true).toBe(true)
    }
  })

  it.each(SCIENTIFIC_SCENARIOS)('monta o contexto contratual do cenário $id', async (scenario) => {
    const ownedContext = getScenarioOwnedContext(scenario)
    await service.generateDarcyResponse({
      ...baseContext,
      projectTitle: scenario.titulo,
      ...(ownedContext.decisaoAutoralContextual
        ? { decisaoAutoralContextual: ownedContext.decisaoAutoralContextual }
        : {}),
      ...(ownedContext.classificacaoCnpqContextual
        ? { classificacaoCnpqContextual: ownedContext.classificacaoCnpqContextual }
        : {}),
    }, scenario.instrucao)

    const request = generate.mock.calls[0][0] as AIGenerationRequest
    const classification = getScenarioClassification(scenario)

    if (!classification) {
      expect(request.systemInstruction).not.toContain('Classificação CNPq confirmada')
      return
    }

    expect(request.systemInstruction).toContain(`Classificação CNPq confirmada**: ${classification.primaria.nome} (${classification.primaria.codigo}; ${classification.primaria.nivel})`)
    expect(request.systemInstruction).toContain(`Versão do catálogo**: ${classification.versao_catalogo}`)
    expect(ownedContext.classificacaoCnpqContextual?.primaria.caminhoCodigos).toEqual(classification.primaria.caminho_codigos)
    expect(ownedContext.classificacaoCnpqContextual?.correlatas.map((entry) => entry.codigo)).toEqual(
      classification.correlatas?.map((entry) => entry.codigo) ?? [],
    )
    expect(request.systemInstruction).toContain('não determina automaticamente método, desenho, resultados, conclusões')

    if (scenario.decisaoAutoral) {
      expect(request.systemInstruction).toContain(scenario.decisaoAutoral)
      expect(request.systemInstruction).toContain('não a trate como instrução')
    }
    if (scenario.observacaoInterdisciplinar) {
      expect(request.systemInstruction).toContain(scenario.observacaoInterdisciplinar)
    }
  })

  it.each([
    'validar-coerencia',
    'sugerir-referencias',
    'checar-objetivos',
    'revisar-clareza',
    'identificar-lacunas',
  ] as const)('preserva o contexto científico na quick action %s', async (actionId) => {
    const scenario = SCIENTIFIC_SCENARIOS.find((item) => item.id === 'interdisciplinar-saude-decisao')
    if (!scenario) throw new Error('Fixture interdisciplinar ausente.')
    const ownedContext = getScenarioOwnedContext(scenario)

    await service.executeQuickAction(actionId, {
      ...baseContext,
      projectTitle: scenario.titulo,
      classificacaoCnpqContextual: ownedContext.classificacaoCnpqContextual ?? undefined,
    })

    const request = generate.mock.calls[0][0] as AIGenerationRequest
    expect(request.mode).toBe('single-turn')
    expect(request.systemInstruction).toContain('Engenharia Biomédica (3.13.00.00-6; area)')
    expect(request.systemInstruction).toContain('Enfermagem de Saúde Pública (4.04.06.00-8; subarea)')
  })

  it('mantém o tema contrastivo separado entre Educação e Ciência da Computação', async () => {
    const education = SCIENTIFIC_SCENARIOS.find((item) => item.id === 'contraste-ia-ensino-educacao')
    const computing = SCIENTIFIC_SCENARIOS.find((item) => item.id === 'contraste-ia-ensino-computacao')
    if (!education || !computing) throw new Error('Fixtures contrastivas ausentes.')

    const educationContext = getScenarioOwnedContext(education)
    const computingContext = getScenarioOwnedContext(computing)
    expect(education.titulo).toBe(computing.titulo)
    expect(education.instrucao).toBe(computing.instrucao)
    expect(educationContext.classificacaoCnpqContextual?.primaria.codigo).toBe('7.08.00.00-6')
    expect(computingContext.classificacaoCnpqContextual?.primaria.codigo).toBe('1.03.00.00-7')
    expect(educationContext.classificacaoCnpqContextual).not.toEqual(computingContext.classificacaoCnpqContextual)
  })
})
