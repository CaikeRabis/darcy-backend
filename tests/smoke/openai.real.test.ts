import 'dotenv/config'

import { beforeAll, describe, expect, it } from 'vitest'

import { AIService } from '../../src/services/ai/AIService'
import {
  getConfiguredAIModel,
  getConfiguredAIProviderName,
} from '../../src/services/ai/providerFactory'

const realTestsEnabled = process.env.RUN_REAL_AI_TESTS === 'true'
const describeReal = realTestsEnabled ? describe : describe.skip

describeReal('OpenAI smoke test real e opt-in', () => {
  beforeAll(() => {
    if (getConfiguredAIProviderName() !== 'openai') {
      throw new Error('Defina AI_PROVIDER=openai para executar o smoke test real.')
    }
    if (!process.env.OPENAI_API_KEY?.trim()) {
      throw new Error('OPENAI_API_KEY é obrigatória para o smoke test real.')
    }
  })

  it('retorna a estrutura mínima de DarcyResponse em uma única chamada', async () => {
    expect(getConfiguredAIModel()).toBeTruthy()

    const result = await AIService.getInstance().generateDarcyResponse({
      projectTitle: 'Teste mínimo da integração',
      projectType: 'resumo-academico',
      currentPhase: 'tema',
    }, 'Responda brevemente confirmando que a integração está disponível.')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.mensagem).toEqual(expect.any(String))
      expect(result.data.mensagem.trim().length).toBeGreaterThan(0)
    }
  })
})
