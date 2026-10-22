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


/** Modelo Gemini usado por todas as chamadas e metadados da API. */
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-lite'
