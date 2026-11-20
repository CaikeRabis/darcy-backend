import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const authGetUser = vi.hoisted(() => vi.fn())
const ensureProfile = vi.hoisted(() => vi.fn())
const diagnose = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { getUser: authGetUser } }) }))
vi.mock('../../src/services/ProfileService', () => ({ ensureProfile }))
vi.mock('../../src/services/ScientificDiagnosisService', () => ({
  ScientificDiagnosisService: class { diagnose = diagnose },
}))

import app from '../../src/app'

let server: Server
let port: number

function post(body: unknown): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const serialized = JSON.stringify(body)
    const req = httpRequest({ hostname: '127.0.0.1', port, path: '/api/v1/modulos/resumo-academico/projeto-1/scientific-diagnosis', method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(serialized) } }, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
    })
    req.on('error', reject)
    req.end(serialized)
  })
}

describe('rota de diagnóstico científico', () => {
  beforeAll(async () => {
    server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(async () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())))
  beforeEach(() => {
    authGetUser.mockReset().mockResolvedValue({ data: { user: { id: 'perfil-a' } }, error: null })
    ensureProfile.mockReset().mockResolvedValue(undefined)
    diagnose.mockReset()
    process.env.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = ''
  })

  it('permanece indisponível por padrão e não chama o serviço', async () => {
    const result = await post({ expectedRevision: 0, scope: 'resumo' })
    expect(result.status).toBe(404)
    expect(diagnose).not.toHaveBeenCalled()
  })

  it('valida a requisição, mapeia sucesso e não expõe dados do provider', async () => {
    process.env.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = 'enabled'
    diagnose.mockResolvedValue({ status: 'success', diagnosis: { projectId: 'projeto-1', analyzedRevision: 0, findings: [] } })
    const result = await post({ expectedRevision: 0, scope: 'resumo' })
    expect(result.status).toBe(200)
    expect(result.body).toEqual({ ok: true, data: { projectId: 'projeto-1', analyzedRevision: 0, findings: [] } })
    expect(diagnose).toHaveBeenCalledWith('projeto-1', 'perfil-a', 0, 'resumo')
  })

  it('mapeia revisão obsoleta para 409', async () => {
    process.env.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = 'enabled'
    diagnose.mockResolvedValue({ status: 'conflict', revision: 2 })
    const result = await post({ expectedRevision: 0, scope: 'resumo' })
    expect(result.status).toBe(409)
    expect(result.body.error.code).toBe('SCIENTIFIC_CONTEXT_REVISION_CONFLICT')
  })
})
