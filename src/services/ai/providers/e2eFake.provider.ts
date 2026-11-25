import type { AIGenerationRequest } from '../contracts'
import type { AIProvider } from '../provider'
import { AIProviderError } from '../contracts'

/** Responde somente ao contrato conhecido de opções dinâmicas; demais operações falham fechadas. */
export class E2EFakeProvider implements AIProvider {
  readonly name = 'e2e-fake' as const
  readonly model = 'deterministic-options-v1'

  async generate(request: AIGenerationRequest): Promise<string> {
    const ids = [...request.prompt.matchAll(/^- ID: ([a-zA-Z0-9_]+) \| Pergunta: /gm)]
      .map((match) => match[1])
    if (ids.length === 0 || ids.length > 30 || new Set(ids).size !== ids.length ||
      !request.prompt.includes("campo 'opcoesDinamicas'")) {
      throw new AIProviderError('PROVIDER_ERROR', this.name)
    }
    return JSON.stringify({
      mensagem: 'Opções simuladas para homologação E2E.',
      opcoesDinamicas: Object.fromEntries(ids.map((id) => [id, [
        'Alternativa simulada A', 'Alternativa simulada B',
        'Alternativa simulada C', 'Alternativa simulada D',
      ]])),
    })
  }
}
