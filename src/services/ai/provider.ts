import type {
  AIGenerationRequest,
  AIProviderName,
} from './contracts'

export interface AIProvider {
  readonly name: AIProviderName
  readonly model: string

  generate(request: AIGenerationRequest): Promise<string>
}
