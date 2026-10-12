import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http'
import type { AddressInfo } from 'node:net'

const authGetUser = vi.hoisted(() => vi.fn())
const generateDarcyResponse = vi.hoisted(() => vi.fn())
const executeQuickAction = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getUser: authGetUser },
  }),
}))

vi.mock('../../src/services/ai/AIService', () => ({
  AIService: {
    getInstance: () => ({
      generateDarcyResponse,
      executeQuickAction,
    }),
  },
}))

import app from '../../src/app'

let server: Server
let port: number

interface HttpResult {
  status: number
  body: unknown
}

function postRequest(
  path: string,
  body: unknown,
  authorization?: string,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const serializedBody = JSON.stringify(body)
    const client = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(serializedBody),
        ...(authorization ? { Authorization: authorization } : {}),
      },
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
    client.end(serializedBody)
  })
}

const chatBody = {
  userMessage: 'Mensagem de teste sem rede externa.',
  context: {
    projectTitle: 'Projeto de teste',
    projectType: 'resumo-academico',
    currentPhase: 'tema',
  },
}

const quickActionBody = {
  actionId: 'validar-coerencia',
  context: chatBody.context,
}

describe('rotas de IA protegidas', () => {
  beforeEach(() => {
    authGetUser.mockReset()
    generateDarcyResponse.mockReset()
    executeQuickAction.mockReset()
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

  it.each(['/api/darcy/chat', '/api/darcy/quick-action'])(
    '%s rejeita POST sem Bearer com 401 antes do controller de IA',
    async (path) => {
      const result = await postRequest(path, {})

      expect(result.status).toBe(401)
      expect(result.body).toEqual({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Não autorizado.',
        },
      })
      expect(authGetUser).not.toHaveBeenCalled()
      expect(generateDarcyResponse).not.toHaveBeenCalled()
      expect(executeQuickAction).not.toHaveBeenCalled()
    },
  )

  it('aceita Bearer validado e encaminha chat ao controller de IA', async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    })
    generateDarcyResponse.mockResolvedValue({
      ok: true,
      data: { mensagem: 'Resposta de IA simulada.' },
    })

    const result = await postRequest('/api/darcy/chat', chatBody, 'Bearer token-fake-de-teste')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      data: { mensagem: 'Resposta de IA simulada.' },
    })
    expect(authGetUser).toHaveBeenCalledWith('token-fake-de-teste')
    expect(generateDarcyResponse).toHaveBeenCalledWith(chatBody.context, chatBody.userMessage)
  })

  it('aceita Bearer validado e encaminha quick action ao controller de IA', async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    })
    executeQuickAction.mockResolvedValue({
      ok: true,
      data: { mensagem: 'Quick action simulada.' },
    })

    const result = await postRequest('/api/darcy/quick-action', quickActionBody, 'Bearer token-fake-de-teste')

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      data: { mensagem: 'Quick action simulada.' },
    })
    expect(authGetUser).toHaveBeenCalledWith('token-fake-de-teste')
    expect(executeQuickAction).toHaveBeenCalledWith(
      quickActionBody.actionId,
      quickActionBody.context,
    )
  })
})
