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


import type { CorsOptions } from 'cors'

const DEVELOPMENT_ORIGIN = 'http://localhost:5174'
const PRODUCTION_ORIGIN = 'https://darcy.app.br'

export class CorsOriginNotAllowedError extends Error {
  readonly statusCode = 403

  constructor() {
    super('Origem não autorizada.')
    this.name = 'CorsOriginNotAllowedError'
  }
}

function getAllowedOrigins(environmentVariables: NodeJS.ProcessEnv = process.env): string[] {
  const environment = environmentVariables.NODE_ENV
  const configuredOrigin = environmentVariables.CORS_ORIGIN?.trim()

  if (environment === 'production') {
    if (configuredOrigin !== PRODUCTION_ORIGIN) {
      throw new Error(
        `Configuração CORS inválida: em produção, CORS_ORIGIN deve ser ${PRODUCTION_ORIGIN}.`,
      )
    }

    return [PRODUCTION_ORIGIN]
  }

  if (configuredOrigin && configuredOrigin !== DEVELOPMENT_ORIGIN) {
    throw new Error(
      `Configuração CORS inválida: em desenvolvimento, CORS_ORIGIN deve ser ${DEVELOPMENT_ORIGIN}.`,
    )
  }

  return [DEVELOPMENT_ORIGIN]
}

/**
 * Valida a origem permitida antes de o servidor aceitar tráfego.
 * Exportada para que a validação de ambiente possa ser testada sem mutar process.env.
 */
export function validateCorsConfiguration(
  environmentVariables: NodeJS.ProcessEnv = process.env,
): void {
  getAllowedOrigins(environmentVariables)
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = getAllowedOrigins()

  return {
    origin(origin, callback) {
      // Ferramentas CLI e integrações server-to-server não enviam Origin.
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new CorsOriginNotAllowedError())
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }
}
