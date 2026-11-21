import type { ApiResponse } from '../types/darcy.types'
import type { AIGenerationRequest } from './ai/contracts'
import type { ScientificDiagnosisGenerator } from './ScientificDiagnosisService'

interface PromptEvidence {
  evidenceId: string
  state: 'confirmado' | 'rascunho_persistido' | 'ausente' | 'invalido'
  value: string | null
}

const EVIDENCE_IDS = new Set(['problema', 'objetivo_geral', 'metodologia'])

function readPromptEvidence(prompt: string): PromptEvidence[] {
  return prompt.split('\n').flatMap((line) => {
    if (!line.trimStart().startsWith('{')) return []

    try {
      const parsed = JSON.parse(line) as Partial<PromptEvidence>
      if (
        typeof parsed.evidenceId !== 'string' || !EVIDENCE_IDS.has(parsed.evidenceId) ||
        (parsed.state !== 'confirmado' && parsed.state !== 'rascunho_persistido' &&
          parsed.state !== 'ausente' && parsed.state !== 'invalido') ||
        (parsed.value !== null && typeof parsed.value !== 'string')
      ) return []

      return [{
        evidenceId: parsed.evidenceId,
        state: parsed.state,
        value: parsed.value ?? null,
      }]
    } catch {
      return []
    }
  })
}

/**
 * Generator determinístico para homologação local. Ele só referencia IDs que
 * o serviço já colocou no snapshot; não acessa rede, credenciais ou banco.
 */
export class ScientificDiagnosisFakeGenerator implements ScientificDiagnosisGenerator {
  async generate(request: AIGenerationRequest): Promise<ApiResponse<string>> {
    const evidence = readPromptEvidence(request.prompt)
    const insufficient = evidence.filter((entry) => (
      entry.state !== 'confirmado' || !entry.value || entry.value.trim() === ''
    ))

    if (insufficient.length === 0) {
      return { ok: true, data: JSON.stringify({ findings: [] }) }
    }

    const evidenceIds = insufficient.map((entry) => entry.evidenceId)
    return {
      ok: true,
      data: JSON.stringify({
        findings: [{
          category: 'informacao_insuficiente',
          elements: evidenceIds,
          evidenceIds,
          explanation: 'Resposta simulada para homologação E2E; não representa avaliação real de IA.',
          guidingQuestion: 'Qual evidência precisa ser explicitada ou confirmada para avançar?',
        }],
      }),
    }
  }
}
