import { beforeEach, describe, expect, it, vi } from 'vitest'

const getSnapshot = vi.hoisted(() => vi.fn())
vi.mock('../../src/services/ResumoAcademicoService', () => ({
  getOwnedResumoScientificContextSnapshot: getSnapshot,
}))

import { ScientificDiagnosisService, type ScientificDiagnosisGenerator } from '../../src/services/ScientificDiagnosisService'
import { SCIENTIFIC_DIAGNOSIS_JSON_SCHEMA } from '../../src/schemas/scientificDiagnosis.schema'

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    projectId: 'projeto-1',
    revision: 3,
    progressState: 'confirmado',
    researchProblem: { state: 'confirmado', origin: 'resposta_usuario_persistida', value: 'Problema claro' },
    generalObjective: { state: 'confirmado', origin: 'resposta_usuario_persistida', value: 'Analisar o problema' },
    specificObjectives: { state: 'ausente', origin: 'nenhuma', values: [] },
    methodology: { state: 'confirmado', origin: 'resposta_usuario_persistida', items: [{ questionId: 'abordagem', value: 'Entrevistas' }] },
    scientificClassification: { state: 'ausente', origin: 'nenhuma', value: null },
    researchStage: { state: 'ausente', origin: 'nenhuma', value: null },
    authorialDecisions: [],
    ...overrides,
  }
}

function generator(response: string | { ok: false; error: { code: string; message: string } }): ScientificDiagnosisGenerator {
  return { generate: vi.fn().mockResolvedValue(typeof response === 'string' ? { ok: true, data: response } : response) }
}

const validProviderResponse = JSON.stringify({
  findings: [{
    category: 'alinhamento',
    elements: ['problema', 'objetivo_geral'],
    evidenceIds: ['problema', 'objetivo_geral'],
    explanation: 'O objetivo responde ao problema apresentado.',
    guidingQuestion: 'Que recorte torna essa relação mais precisa?',
  }],
})

describe('ScientificDiagnosisService', () => {
  beforeEach(() => getSnapshot.mockReset())

  it('não consulta o provider para projeto inexistente ou de outro usuário', async () => {
    getSnapshot.mockResolvedValue(undefined)
    const provider = generator(validProviderResponse)
    await expect(new ScientificDiagnosisService(provider).diagnose('alheio', 'perfil-a', 0, 'resumo')).resolves.toEqual({ status: 'not_found' })
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it('retorna conflito antes de chamar IA quando a revisão diverge', async () => {
    getSnapshot.mockResolvedValue({ status: 'conflict', revision: 4 })
    const provider = generator(validProviderResponse)
    await expect(new ScientificDiagnosisService(provider).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'conflict', revision: 4 })
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it('revalida a revisão depois da resposta do provider', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
      .mockResolvedValueOnce({ status: 'found', snapshot: snapshot({ revision: 4 }) })
    const provider = generator(validProviderResponse)
    await expect(new ScientificDiagnosisService(provider).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'conflict', revision: 4 })
  })

  it('retorna diagnóstico com evidências resolvidas pelo snapshot', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
      .mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const provider = generator(validProviderResponse)
    const result = await new ScientificDiagnosisService(provider).diagnose('p', 'u', 3, 'resumo')
    expect(result.status).toBe('success')
    if (result.status === 'success') {
      expect(result.diagnosis.analyzedRevision).toBe(3)
      expect(result.diagnosis.analyzedContentHash).toMatch(/^[a-f0-9]{64}$/)
      expect(result.diagnosis.analyzedEvidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'problema', value: 'Problema claro' }),
        expect.objectContaining({ id: 'metodologia', value: 'abordagem: Entrevistas' }),
      ]))
      expect(result.diagnosis.findings[0]?.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'problema', excerpt: 'Problema claro' }),
      ]))
    }
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({
      responseFormat: expect.objectContaining({
        name: 'scientific_diagnosis',
        strict: true,
        schema: SCIENTIFIC_DIAGNOSIS_JSON_SCHEMA,
      }),
    }))
  })

  it('rejeita conteúdo alterado mesmo se uma escrita externa não avançar a revisão', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
      .mockResolvedValueOnce({ status: 'found', snapshot: snapshot({
        researchProblem: { state: 'confirmado', origin: 'resposta_usuario_persistida', value: 'Outro problema' },
      }) })
    await expect(new ScientificDiagnosisService(generator(validProviderResponse)).diagnose('p', 'u', 3, 'resumo'))
      .resolves.toEqual({ status: 'conflict', revision: 3 })
  })

  it('rejeita referência de evidência que não existe', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const provider = generator(validProviderResponse.replace('problema', 'inventada'))
    await expect(new ScientificDiagnosisService(provider).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
  })

  it('produz informação insuficiente sem enviar contexto inválido ao provider', async () => {
    getSnapshot.mockResolvedValue({ status: 'found', snapshot: snapshot({
      progressState: 'invalido',
      researchProblem: { state: 'invalido', origin: 'progresso_invalido', value: null },
      generalObjective: { state: 'invalido', origin: 'progresso_invalido', value: null },
      methodology: { state: 'invalido', origin: 'progresso_invalido', items: [] },
    }) })
    const provider = generator(validProviderResponse)
    const result = await new ScientificDiagnosisService(provider).diagnose('p', 'u', 3, 'resumo')
    expect(result).toMatchObject({ status: 'success', diagnosis: { findings: [{ category: 'informacao_insuficiente' }] } })
    expect(provider.generate).not.toHaveBeenCalled()
  })

  it('propaga falha do provider sem escrever no projeto', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const result = await new ScientificDiagnosisService(generator({ ok: false, error: { code: 'TIMEOUT', message: 'timeout' } })).diagnose('p', 'u', 3, 'resumo')
    expect(result).toEqual({ status: 'provider_error', code: 'TIMEOUT', message: 'timeout' })
  })

  it('rejeita JSON e contratos estruturais inválidos', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    await expect(new ScientificDiagnosisService(generator('não-json')).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    await expect(new ScientificDiagnosisService(generator(JSON.stringify({ findings: [{ category: 'alinhamento' }] }))).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
  })

  it('mantém a revisão 0 de projetos legados no envelope', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot({ revision: 0 }) })
      .mockResolvedValueOnce({ status: 'found', snapshot: snapshot({ revision: 0 }) })
    const result = await new ScientificDiagnosisService(generator(validProviderResponse)).diagnose('p', 'u', 0, 'resumo')
    expect(result).toMatchObject({ status: 'success', diagnosis: { analyzedRevision: 0 } })
  })

  it('preserva o estado provisório de rascunhos nas evidências', async () => {
    const draft = snapshot({ researchProblem: { state: 'rascunho_persistido', origin: 'resposta_usuario_persistida', value: 'Problema em rascunho' } })
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: draft }).mockResolvedValueOnce({ status: 'found', snapshot: draft })
    const result = await new ScientificDiagnosisService(generator(JSON.stringify({ findings: [{ category: 'tensao', elements: ['problema'], evidenceIds: ['problema'], explanation: 'Rascunho exige confirmação.', guidingQuestion: 'O problema está confirmado?' }] }))).diagnose('p', 'u', 3, 'resumo')
    expect(result).toMatchObject({ status: 'success', diagnosis: { findings: [{ evidence: [{ state: 'rascunho_persistido' }] }] } })
  })

  it('não permite contradição fundada em dado não confirmado', async () => {
    const draft = snapshot({ researchProblem: { state: 'rascunho_persistido', origin: 'resposta_usuario_persistida', value: 'Problema provisório' } })
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: draft })
    const response = JSON.stringify({ findings: [{ category: 'contradicao', elements: ['problema'], evidenceIds: ['problema'], explanation: 'Não basta para contradição.', guidingQuestion: 'O problema foi confirmado?' }] })
    await expect(new ScientificDiagnosisService(generator(response)).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
  })

  it.each(['alinhamento', 'tensao', 'contradicao'] as const)('aceita a categoria científica %s sem notas arbitrárias', async (category) => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() }).mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const response = JSON.stringify({ findings: [{ category, elements: ['problema', 'objetivo_geral'], evidenceIds: ['problema', 'objetivo_geral'], explanation: 'Observação fundamentada.', guidingQuestion: 'Que evidência adicional é necessária?' }] })
    const result = await new ScientificDiagnosisService(generator(response)).diagnose('p', 'u', 3, 'resumo')
    expect(result).toMatchObject({ status: 'success', diagnosis: { findings: [{ category }] } })
  })

  it('não aceita revisão ou campos científicos inventados pelo provider', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const response = JSON.stringify({ analyzedRevision: 999, findings: [{ category: 'alinhamento', elements: ['problema'], evidenceIds: ['problema'], explanation: 'x', guidingQuestion: 'y' }] })
    await expect(new ScientificDiagnosisService(generator(response)).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
  })

  it('rejeita achados acima do limite e textos excessivos', async () => {
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const tooMany = Array.from({ length: 9 }, () => ({ category: 'alinhamento', elements: ['problema'], evidenceIds: ['problema'], explanation: 'x', guidingQuestion: 'y' }))
    await expect(new ScientificDiagnosisService(generator(JSON.stringify({ findings: tooMany }))).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: snapshot() })
    const tooLong = { findings: [{ category: 'alinhamento', elements: ['problema'], evidenceIds: ['problema'], explanation: 'x'.repeat(2_001), guidingQuestion: 'y' }] }
    await expect(new ScientificDiagnosisService(generator(JSON.stringify(tooLong))).diagnose('p', 'u', 3, 'resumo')).resolves.toEqual({ status: 'invalid_provider_response' })
  })

  it('não inclui conteúdo inválido no prompt encaminhado ao provider', async () => {
    const invalid = snapshot({ researchProblem: { state: 'invalido', origin: 'progresso_invalido', value: 'não deve sair' } })
    getSnapshot.mockResolvedValueOnce({ status: 'found', snapshot: invalid }).mockResolvedValueOnce({ status: 'found', snapshot: invalid })
    const provider = generator(validProviderResponse)
    await new ScientificDiagnosisService(provider).diagnose('p', 'u', 3, 'resumo')
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.not.stringContaining('não deve sair') }))
  })
})
