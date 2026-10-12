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

function getAllowedOrigins(): string[] {
  const environment = process.env.NODE_ENV
  const configuredOrigin = process.env.CORS_ORIGIN?.trim()

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
