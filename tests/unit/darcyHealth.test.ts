import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http'
import type { AddressInfo } from 'node:net'

const verifyDatabaseReadiness = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/readiness', () => ({
  verifyDatabaseReadiness,
}))

import app from '../../src/app'

let server: Server
let port: number

interface HttpResult {
  status: number
  body: unknown
}

function getRequest(path: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const client = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'GET',
    }, (response: IncomingMessage) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        try {
          resolve({
            status: response.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
          })
        } catch (error) {
          reject(error)
        }
      })
    })

    client.on('error', reject)
    client.end()
  })
}

describe('health e readiness', () => {
  beforeEach(() => {
    verifyDatabaseReadiness.mockReset()
  })

  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
  })

  it('responde liveness sem consultar dependências', async () => {
    const result = await getRequest('/api/darcy/health')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      data: { status: 'alive' },
    })
    expect(verifyDatabaseReadiness).not.toHaveBeenCalled()
  })

  it('responde readiness saudável quando o banco está disponível', async () => {
    verifyDatabaseReadiness.mockResolvedValue(undefined)

    const result = await getRequest('/api/darcy/ready')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      data: { status: 'ready' },
    })
    expect(verifyDatabaseReadiness).toHaveBeenCalledOnce()
  })

  it('responde 503 sem detalhes internos quando o banco está indisponível', async () => {
    verifyDatabaseReadiness.mockRejectedValue(new Error('Falha de conexão simulada.'))

    const result = await getRequest('/api/darcy/ready')

    expect(result.status).toBe(503)
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: 'NOT_READY',
        message: 'Serviço indisponível temporariamente.',
      },
    })
  })
})
