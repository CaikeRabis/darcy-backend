import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  ensureProfile: vi.fn(),
  listOwnedResumoAcademicoHistory: vi.fn(),
  getResumoAcademicoProgress: vi.fn(),
  upsertResumoAcademicoProgress: vi.fn(),
  getOwnedResumoScientificContext: vi.fn(),
  generateDarcyResponse: vi.fn(),
  executeQuickAction: vi.fn(),
}))

vi.mock('../../src/lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getUser: mocks.authGetUser },
  }),
}))

vi.mock('../../src/services/ProfileService', () => ({
  ensureProfile: mocks.ensureProfile,
}))

vi.mock('../../src/services/ResumoAcademicoService', () => ({
  listOwnedResumoAcademicoHistory: mocks.listOwnedResumoAcademicoHistory,
  getResumoAcademicoProgress: mocks.getResumoAcademicoProgress,
  upsertResumoAcademicoProgress: mocks.upsertResumoAcademicoProgress,
  getOwnedResumoScientificContext: mocks.getOwnedResumoScientificContext,
}))

vi.mock('../../src/services/ai/AIService', () => ({
  AIService: {
    getInstance: () => ({
      generateDarcyResponse: mocks.generateDarcyResponse,
      executeQuickAction: mocks.executeQuickAction,
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

function request(path: string, method: 'GET' | 'POST', authorization?: string): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: authorization ? { Authorization: authorization } : {},
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

    request.on('error', reject)
    request.end()
  })
}

describe('rota autenticada de histórico do Resumo Acadêmico', () => {
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

  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset()
    mocks.authGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    })
    mocks.ensureProfile.mockResolvedValue(undefined)
  })

  it('rejeita acesso sem autenticação antes de consultar o histórico', async () => {
    const result = await request('/api/v1/modulos/resumo-academico/project-owned/history', 'GET')

    expect(result.status).toBe(401)
    expect(mocks.listOwnedResumoAcademicoHistory).not.toHaveBeenCalled()
  })

  it('retorna uma página somente para o projeto pertencente ao perfil autenticado', async () => {
    const history = {
      events: [{
        id: 'event-3',
        projectId: 'project-owned',
        sequence: 3,
        type: 'secao_aprovada',
        actor: 'pesquisador',
        section: 'contexto',
        summary: 'Seção Contexto aprovada pelo pesquisador.',
        contentVersionRef: null,
        createdAt: new Date('2026-10-23T12:00:00.000Z'),
      }],
      nextCursor: null,
    }
    mocks.listOwnedResumoAcademicoHistory.mockResolvedValue(history)

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/history?limit=2&beforeSequence=8',
      'GET',
      'Bearer token-fake-de-teste',
    )

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, history: JSON.parse(JSON.stringify(history)) })
    expect(mocks.listOwnedResumoAcademicoHistory).toHaveBeenCalledWith(
      'project-owned',
      '00000000-0000-4000-8000-000000000001',
      2,
      8,
    )
  })

  it('oculta projeto alheio como não encontrado e não expõe rota de escrita', async () => {
    mocks.listOwnedResumoAcademicoHistory.mockResolvedValue(undefined)

    const notFound = await request(
      '/api/v1/modulos/resumo-academico/project-alheio/history',
      'GET',
      'Bearer token-fake-de-teste',
    )

    expect(notFound.status).toBe(404)
    expect(notFound.body).toEqual({
      ok: false,
      error: { code: 'PROJECT_NOT_FOUND', message: 'Projeto não encontrado.' },
    })

    const writeAttempt = await request(
      '/api/v1/modulos/resumo-academico/project-owned/history',
      'POST',
      'Bearer token-fake-de-teste',
    )
    expect(writeAttempt.status).toBe(404)
  })

  it('rejeita cursor inválido sem acionar o serviço', async () => {
    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/history?beforeSequence=zero',
      'GET',
      'Bearer token-fake-de-teste',
    )

    expect(result.status).toBe(400)
    expect(mocks.listOwnedResumoAcademicoHistory).not.toHaveBeenCalled()
  })
})
