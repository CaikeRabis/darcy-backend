import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  type Content,
} from '@google/generative-ai'

import { GEMINI_MODEL } from '../../../config/gemini'
import {
  AIProviderError,
  type AIGenerationRequest,
} from '../contracts'
import type { AIProvider } from '../provider'

const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
]

export class GeminiProvider implements AIProvider {
  public readonly name = 'gemini' as const
  public readonly model = GEMINI_MODEL
  private readonly client: GoogleGenerativeAI

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY?.trim()

    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
      throw new AIProviderError('AUTH_ERROR', this.name)
    }

    this.client = new GoogleGenerativeAI(apiKey)
  }

  async generate(request: AIGenerationRequest): Promise<string> {
    try {
      const model = this.client.getGenerativeModel({
        model: this.model,
        systemInstruction: request.systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: request.options.temperature,
          topP: request.options.topP,
          topK: request.options.topK,
          maxOutputTokens: request.options.maxOutputTokens,
        },
        safetySettings: SAFETY_SETTINGS,
      })

      if (request.mode === 'single-turn') {
        const result = await model.generateContent(request.prompt)
        return result.response.text()
      }

      const history: Content[] = request.history.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }))
      const chat = model.startChat({ history })
      const result = await chat.sendMessage(request.prompt)

      return result.response.text()
    } catch (error) {
      throw this.normalizeError(error)
    }
  }

  private normalizeError(error: unknown): AIProviderError {
    if (error instanceof AIProviderError) return error

    const message = error instanceof Error ? error.message.toLowerCase() : ''

    if (message.includes('429') || message.includes('quota')) {
      return new AIProviderError('RATE_LIMIT', this.name)
    }
    if (message.includes('401') || message.includes('403') || message.includes('api key')) {
      return new AIProviderError('AUTH_ERROR', this.name)
    }
    if (message.includes('safety') || message.includes('blocked')) {
      return new AIProviderError('CONTENT_BLOCKED', this.name)
    }
    if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) {
      return new AIProviderError('TIMEOUT', this.name)
    }
    if (message.includes('fetch') || message.includes('network')) {
      return new AIProviderError('NETWORK_ERROR', this.name)
    }

    return new AIProviderError('PROVIDER_ERROR', this.name)
  }
}
