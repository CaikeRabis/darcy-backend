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


import type {
  AIGenerationRequest,
  AIProviderName,
} from './contracts'

export interface AIProvider {
  readonly name: AIProviderName
  readonly model: string

  generate(request: AIGenerationRequest): Promise<string>
}
