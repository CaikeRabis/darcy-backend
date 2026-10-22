import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  getScenarioOwnedContext,
  SCIENTIFIC_SCENARIOS,
} from '../fixtures/cnpqScientificScenarios'

const authGetUser = vi.hoisted(() => vi.fn())
const generateDarcyResponse = vi.hoisted(() => vi.fn())
const executeQuickAction = vi.hoisted(() => vi.fn())
const getOwnedResumoScientificContext = vi.hoisted(() => vi.fn())

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

vi.mock('../../src/services/ResumoAcademicoService', () => ({
  getOwnedResumoScientificContext,
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
    getOwnedResumoScientificContext.mockReset()
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

  it('recupera decisão e classificação somente pelo Project pertencente ao usuário autenticado', async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    })
    getOwnedResumoScientificContext.mockResolvedValue({
      decisaoAutoralContextual: 'Problema central escolhido pelo pesquisador: baixa adesão.',
      classificacaoCnpqContextual: {
        versaoCatalogo: 'cnpq-tac-2013-04-25',
        primaria: {
          codigo: '1.03.03.03-0',
          nome: 'Banco de Dados',
          nivel: 'especialidade',
          caminhoCodigos: ['1.00.00.00-3', '1.03.00.00-7', '1.03.03.00-6', '1.03.03.03-0'],
        },
        correlatas: [],
      },
    })
    generateDarcyResponse.mockResolvedValue({ ok: true, data: { mensagem: 'Resposta contextual.' } })

    const result = await postRequest('/api/darcy/chat', {
      ...chatBody,
      context: { ...chatBody.context, projectId: 'project-do-usuario' },
    }, 'Bearer token-fake-de-teste')

    expect(result.status).toBe(200)
    expect(getOwnedResumoScientificContext).toHaveBeenCalledWith(
      'project-do-usuario',
      '00000000-0000-4000-8000-000000000001',
    )
    expect(generateDarcyResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        decisaoAutoralContextual: 'Problema central escolhido pelo pesquisador: baixa adesão.',
        classificacaoCnpqContextual: expect.objectContaining({
          primaria: expect.objectContaining({ codigo: '1.03.03.03-0' }),
        }),
      }),
      chatBody.userMessage,
    )
  })

  it.each(SCIENTIFIC_SCENARIOS)(
    'encaminha no chat somente o contexto persistido do cenário $id',
    async (scenario) => {
      authGetUser.mockResolvedValue({
        data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
        error: null,
      })
      const ownedContext = getScenarioOwnedContext(scenario)
      getOwnedResumoScientificContext.mockResolvedValue(ownedContext)
      generateDarcyResponse.mockResolvedValue({ ok: true, data: { mensagem: 'Resposta contextual.' } })

      const result = await postRequest('/api/darcy/chat', {
        ...chatBody,
        userMessage: scenario.instrucao,
        context: {
          ...chatBody.context,
          projectId: `project-${scenario.id}`,
          researchField: 'Campo livre não confiável',
          classificacaoCnpqContextual: {
            versaoCatalogo: 'cliente-invalido',
          },
        },
      }, 'Bearer token-fake-de-teste')

      expect(result.status).toBe(200)
      expect(getOwnedResumoScientificContext).toHaveBeenCalledWith(
        `project-${scenario.id}`,
        '00000000-0000-4000-8000-000000000001',
      )
      expect(generateDarcyResponse).toHaveBeenCalledWith(expect.anything(), scenario.instrucao)
      const [contextToAi] = generateDarcyResponse.mock.calls[0]
      expect(contextToAi.researchField).toBeUndefined()
      expect(contextToAi.classificacaoCnpqContextual).toEqual(ownedContext.classificacaoCnpqContextual ?? undefined)
      expect(contextToAi.decisaoAutoralContextual).toBe(ownedContext.decisaoAutoralContextual ?? undefined)
    },
  )

  it('não encaminha decisão quando o Project não pertence ao usuário autenticado', async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    })
    getOwnedResumoScientificContext.mockResolvedValue(undefined)

    const result = await postRequest('/api/darcy/chat', {
      ...chatBody,
      context: { ...chatBody.context, projectId: 'project-de-outro-usuario' },
    }, 'Bearer token-fake-de-teste')

    expect(result.status).toBe(404)
    expect(generateDarcyResponse).not.toHaveBeenCalled()
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

  it('enriquece quick action com classificação persistida e descarta researchField do cliente', async () => {
    authGetUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
      error: null,
    })
    getOwnedResumoScientificContext.mockResolvedValue({
      decisaoAutoralContextual: null,
      classificacaoCnpqContextual: {
        versaoCatalogo: 'cnpq-tac-2013-04-25',
        primaria: {
          codigo: '1.03.03.03-0',
          nome: 'Banco de Dados',
          nivel: 'especialidade',
          caminhoCodigos: ['1.00.00.00-3', '1.03.00.00-7', '1.03.03.00-6', '1.03.03.03-0'],
        },
        correlatas: [],
      },
    })
    executeQuickAction.mockResolvedValue({ ok: true, data: { mensagem: 'Contexto seguro.' } })

    const result = await postRequest('/api/darcy/quick-action', {
      ...quickActionBody,
      context: {
        ...quickActionBody.context,
        projectId: 'project-do-usuario',
        researchField: 'Campo arbitrário enviado pelo cliente',
      },
    }, 'Bearer token-fake-de-teste')

    expect(result.status).toBe(200)
    expect(executeQuickAction).toHaveBeenCalledWith(
      quickActionBody.actionId,
      expect.objectContaining({
        classificacaoCnpqContextual: expect.objectContaining({
          primaria: expect.objectContaining({ codigo: '1.03.03.03-0' }),
        }),
      }),
    )
    const contextualizedContext = executeQuickAction.mock.calls[0][1]
    expect(contextualizedContext.researchField).toBeUndefined()
  })

  it.each([
    'validar-coerencia',
    'sugerir-referencias',
    'checar-objetivos',
    'revisar-clareza',
    'identificar-lacunas',
  ] as const)(
    'encaminha a quick action %s com classificação autenticada',
    async (actionId) => {
      authGetUser.mockResolvedValue({
        data: { user: { id: '00000000-0000-4000-8000-000000000001' } },
        error: null,
      })
      const scenario = SCIENTIFIC_SCENARIOS.find((item) => item.id === 'interdisciplinar-mobilidade-urbana')
      if (!scenario) throw new Error('Fixture de mobilidade urbana ausente.')
      const ownedContext = getScenarioOwnedContext(scenario)
      getOwnedResumoScientificContext.mockResolvedValue(ownedContext)
      executeQuickAction.mockResolvedValue({ ok: true, data: { mensagem: 'Ação contextual.' } })

      const result = await postRequest('/api/darcy/quick-action', {
        actionId,
        context: {
          ...quickActionBody.context,
          projectId: 'project-mobilidade',
          researchField: 'Campo livre não confiável',
        },
      }, 'Bearer token-fake-de-teste')

      expect(result.status).toBe(200)
      expect(executeQuickAction).toHaveBeenCalledWith(actionId, expect.objectContaining({
        classificacaoCnpqContextual: ownedContext.classificacaoCnpqContextual,
      }))
      const [, contextToAi] = executeQuickAction.mock.calls[0]
      expect(contextToAi.researchField).toBeUndefined()
    },
  )
})
