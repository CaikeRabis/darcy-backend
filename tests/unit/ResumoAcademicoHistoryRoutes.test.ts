import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const mocks = vi.hoisted(() => ({
  authGetUser: vi.fn(),
  ensureProfile: vi.fn(),
  listOwnedResumoAcademicoHistory: vi.fn(),
  listOwnedResumoAcademicoTextVersionMetadata: vi.fn(),
  getOwnedResumoAcademicoTextVersion: vi.fn(),
  getResumoAcademicoProgress: vi.fn(),
  upsertResumoAcademicoProgress: vi.fn(),
  approveResumoAcademicoSection: vi.fn(),
  consolidateResumoAcademico: vi.fn(),
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
  approveResumoAcademicoSection: mocks.approveResumoAcademicoSection,
  consolidateResumoAcademico: mocks.consolidateResumoAcademico,
  getOwnedResumoScientificContext: mocks.getOwnedResumoScientificContext,
}))

vi.mock('../../src/services/ResumoAcademicoTextVersionService', () => ({
  listOwnedResumoAcademicoTextVersionMetadata: mocks.listOwnedResumoAcademicoTextVersionMetadata,
  getOwnedResumoAcademicoTextVersion: mocks.getOwnedResumoAcademicoTextVersion,
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

function request(
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  authorization?: string,
  body?: unknown,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const serializedBody = body === undefined ? undefined : JSON.stringify(body)
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        ...(authorization ? { Authorization: authorization } : {}),
        ...(serializedBody ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(serializedBody),
        } : {}),
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

    request.on('error', reject)
    request.end(serializedBody)
  })
}

function makeProgress() {
  const section = () => ({
    respostas_usuario: {},
    diagnostico: '',
    lacunas: [],
    texto_sugerido: '',
    status: 'pendente',
  })

  return {
    titulo_provisorio: '',
    tema: 'Tema de rota',
    area_conhecimento: '',
    nivel_academico: 'Mestrado',
    estagio_pesquisa: 'em_andamento',
    contexto: section(),
    objetivo: section(),
    metodologia: section(),
    fundamentacao_teorica: section(),
    resultados: { ...section(), tipo: '' },
    resumo_completo: '',
    numero_palavras: 0,
    limite_palavras: 250,
    avaliacao_final: {
      coerencia: '',
      clareza: '',
      coesao: '',
      adequacao_academica: '',
      problemas_identificados: [],
      sugestoes: [],
    },
  }
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

  it('lista somente metadados de versões com paginação e ownership', async () => {
    mocks.listOwnedResumoAcademicoTextVersionMetadata.mockResolvedValue({
      versions: [{
        id: 'version-2',
        projectId: 'project-owned',
        scopeKey: 'secao.contexto',
        section: 'contexto',
        versionNumber: 2,
        progressRevision: 5,
        origin: 'pesquisador',
        contentHash: 'a'.repeat(64),
        previousVersionId: 'version-1',
        sourceEventId: 'event-2',
        createdAt: new Date('2026-11-03T10:00:00.000Z'),
      }],
      nextCursor: 1,
    })

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/versions?scopeKey=secao.contexto&section=contexto&limit=1&beforeVersionNumber=3',
      'GET',
      'Bearer token-fake-de-teste',
    )

    expect(result.status).toBe(200)
    expect(result.body).toEqual({
      ok: true,
      versions: {
        versions: [{
          id: 'version-2',
          projectId: 'project-owned',
          scopeKey: 'secao.contexto',
          section: 'contexto',
          versionNumber: 2,
          progressRevision: 5,
          origin: 'pesquisador',
          contentHash: 'a'.repeat(64),
          previousVersionId: 'version-1',
          sourceEventId: 'event-2',
          createdAt: '2026-11-03T10:00:00.000Z',
        }],
        nextCursor: 1,
      },
    })
    expect(mocks.listOwnedResumoAcademicoTextVersionMetadata).toHaveBeenCalledWith(
      'project-owned',
      '00000000-0000-4000-8000-000000000001',
      { scopeKey: 'secao.contexto', section: 'contexto', limit: 1, beforeVersionNumber: 3 },
    )
  })

  it('retorna texto integral somente na consulta autenticada de uma versão', async () => {
    const version = {
      id: 'version-1',
      projectId: 'project-owned',
      scopeKey: 'secao.contexto',
      section: 'contexto',
      versionNumber: 1,
      progressRevision: 4,
      origin: 'pesquisador',
      content: 'Texto integral protegido.',
      contentHash: 'b'.repeat(64),
      previousVersionId: null,
      sourceEventId: 'event-1',
      createdAt: new Date('2026-11-03T10:00:00.000Z'),
    }
    mocks.getOwnedResumoAcademicoTextVersion.mockResolvedValue(version)

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/versions/version-1',
      'GET',
      'Bearer token-fake-de-teste',
    )

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, version: JSON.parse(JSON.stringify(version)) })
    expect(mocks.getOwnedResumoAcademicoTextVersion).toHaveBeenCalledWith(
      'project-owned',
      '00000000-0000-4000-8000-000000000001',
      'version-1',
    )
  })

  it('oculta versão de outro projeto como 404', async () => {
    mocks.getOwnedResumoAcademicoTextVersion.mockResolvedValue(undefined)

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-other/versions/version-1',
      'GET',
      'Bearer token-fake-de-teste',
    )

    expect(result.status).toBe(404)
    expect(result.body).toEqual({
      ok: false,
      error: { code: 'TEXT_VERSION_NOT_FOUND', message: 'Versão textual não encontrada.' },
    })
  })

  it('retorna revisão zero para progresso inexistente e a revisão persistida para projeto próprio', async () => {
    mocks.getResumoAcademicoProgress
      .mockResolvedValueOnce({ progress: null, revision: 0 })
      .mockResolvedValueOnce({ progress: makeProgress(), revision: 4 })

    const empty = await request(
      '/api/v1/modulos/resumo-academico/project-owned',
      'GET',
      'Bearer token-fake-de-teste',
    )
    expect(empty.status).toBe(200)
    expect(empty.body).toEqual({ ok: true, progress: null, revision: 0 })

    const persisted = await request(
      '/api/v1/modulos/resumo-academico/project-owned',
      'GET',
      'Bearer token-fake-de-teste',
    )
    expect(persisted.status).toBe(200)
    expect(persisted.body).toEqual({ ok: true, progress: makeProgress(), revision: 4 })
  })

  it('exige expectedRevision e retorna a revisão confirmada no PUT', async () => {
    const progress = makeProgress()
    const withoutRevision = await request(
      '/api/v1/modulos/resumo-academico/project-owned',
      'PUT',
      'Bearer token-fake-de-teste',
      { progress },
    )
    expect(withoutRevision.status).toBe(400)
    expect(mocks.upsertResumoAcademicoProgress).not.toHaveBeenCalled()

    mocks.upsertResumoAcademicoProgress.mockResolvedValue({
      status: 'saved',
      progress,
      revision: 1,
    })
    const saved = await request(
      '/api/v1/modulos/resumo-academico/project-owned',
      'PUT',
      'Bearer token-fake-de-teste',
      { progress, expectedRevision: 0 },
    )
    expect(saved.status).toBe(200)
    expect(saved.body).toEqual({ ok: true, progress, revision: 1 })
    expect(mocks.upsertResumoAcademicoProgress).toHaveBeenCalledWith(
      'project-owned',
      '00000000-0000-4000-8000-000000000001',
      progress,
      0,
    )
  })

  it.each([-1, 1.5, 'zero'])('rejeita expectedRevision inválida (%p)', async (expectedRevision) => {
    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned',
      'PUT',
      'Bearer token-fake-de-teste',
      { progress: makeProgress(), expectedRevision },
    )
    expect(result.status).toBe(400)
    expect(mocks.upsertResumoAcademicoProgress).not.toHaveBeenCalled()
  })

  it('oculta o estado e retorna 409 sem dados quando a revisão está desatualizada', async () => {
    mocks.upsertResumoAcademicoProgress.mockResolvedValue({ status: 'conflict' })

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned',
      'PUT',
      'Bearer token-fake-de-teste',
      { progress: makeProgress(), expectedRevision: 2 },
    )

    expect(result.status).toBe(409)
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: 'RESUMO_PROGRESS_REVISION_CONFLICT',
        message: 'O progresso foi alterado em outra sessão. Recarregue a versão mais recente antes de salvar novamente.',
      },
    })
  })

  it('mantém ownership: projeto não pertencente retorna 404 para GET e PUT', async () => {
    mocks.getResumoAcademicoProgress.mockResolvedValue(undefined)
    mocks.upsertResumoAcademicoProgress.mockResolvedValue(undefined)

    const read = await request(
      '/api/v1/modulos/resumo-academico/project-alheio',
      'GET',
      'Bearer token-fake-de-teste',
    )
    const write = await request(
      '/api/v1/modulos/resumo-academico/project-alheio',
      'PUT',
      'Bearer token-fake-de-teste',
      { progress: makeProgress(), expectedRevision: 0 },
    )

    expect(read.status).toBe(404)
    expect(write.status).toBe(404)
  })

  it('mantém aprovação como comando autenticado separado do autosave', async () => {
    const progress = makeProgress()
    progress.contexto.texto_sugerido = 'Texto aprovado.'
    progress.contexto.status = 'aprovado'
    mocks.approveResumoAcademicoSection.mockResolvedValue({ status: 'saved', progress, revision: 2 })

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/sections/contexto/approve',
      'POST',
      'Bearer token-fake-de-teste',
      { progress, expectedRevision: 1 },
    )

    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, progress, revision: 2 })
    expect(mocks.approveResumoAcademicoSection).toHaveBeenCalledWith(
      'project-owned',
      '00000000-0000-4000-8000-000000000001',
      progress,
      1,
      'contexto',
    )
  })

  it('retorna 409 no comando de consolidação sem expor estado remoto', async () => {
    mocks.consolidateResumoAcademico.mockResolvedValue({ status: 'conflict' })

    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/consolidate',
      'POST',
      'Bearer token-fake-de-teste',
      { progress: makeProgress(), expectedRevision: 4 },
    )

    expect(result.status).toBe(409)
    expect(result.body).toEqual({
      ok: false,
      error: {
        code: 'RESUMO_PROGRESS_REVISION_CONFLICT',
        message: 'O progresso foi alterado em outra sessão. Recarregue a versão mais recente antes de salvar novamente.',
      },
    })
  })

  it('rejeita comando sem autenticação antes de acionar o serviço', async () => {
    const result = await request(
      '/api/v1/modulos/resumo-academico/project-owned/consolidate',
      'POST',
      undefined,
      { progress: makeProgress(), expectedRevision: 0 },
    )

    expect(result.status).toBe(401)
    expect(mocks.consolidateResumoAcademico).not.toHaveBeenCalled()
  })
})
