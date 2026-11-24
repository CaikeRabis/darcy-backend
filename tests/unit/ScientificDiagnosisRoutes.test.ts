import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

const authGetUser = vi.hoisted(() => vi.fn())
const ensureProfile = vi.hoisted(() => vi.fn())
const diagnose = vi.hoisted(() => vi.fn())
const listDiagnoses = vi.hoisted(() => vi.fn())
const getDiagnosis = vi.hoisted(() => vi.fn())

vi.mock('../../src/lib/supabase', () => ({ getSupabaseClient: () => ({ auth: { getUser: authGetUser } }) }))
vi.mock('../../src/services/ProfileService', () => ({ ensureProfile }))
vi.mock('../../src/services/ScientificDiagnosisService', () => ({
  ScientificDiagnosisService: class { diagnose = diagnose },
}))
vi.mock('../../src/services/ScientificDiagnosisPersistenceService', () => ({
  persistScientificDiagnosis: vi.fn(),
  listOwnedScientificDiagnoses: listDiagnoses,
  getOwnedScientificDiagnosis: getDiagnosis,
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

function get(path: string): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port, path, method: 'GET', headers: { Authorization: 'Bearer token' } }, (res: IncomingMessage) => {
      const chunks: Buffer[] = []
      res.on('data', (chunk) => chunks.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
    })
    req.on('error', reject)
    req.end()
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
    listDiagnoses.mockReset()
    getDiagnosis.mockReset()
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

  it('lista e lê somente diagnósticos pertencentes ao projeto autenticado', async () => {
    process.env.DARCY_SCIENTIFIC_DIAGNOSIS_ENABLED = 'enabled'
    const record = { id: 'diagnosis-1', projectId: 'projeto-1', profileId: 'perfil-a', scope: 'resumo', analyzedRevision: 1, textVersionId: null, diagnosis: { projectId: 'projeto-1', analyzedRevision: 1, findings: [] }, createdAt: new Date().toISOString() }
    listDiagnoses.mockResolvedValue({ diagnoses: [record], nextCursor: null })
    getDiagnosis.mockResolvedValue(record)
    await expect(get('/api/v1/modulos/resumo-academico/projeto-1/scientific-diagnoses?limit=10')).resolves.toMatchObject({ status: 200, body: { ok: true, diagnoses: { diagnoses: [{ id: 'diagnosis-1' }] } } })
    await expect(get('/api/v1/modulos/resumo-academico/projeto-1/scientific-diagnoses/diagnosis-1')).resolves.toMatchObject({ status: 200, body: { ok: true, diagnosis: { id: 'diagnosis-1' } } })
    expect(listDiagnoses).toHaveBeenCalledWith('projeto-1', 'perfil-a', { limit: 10 })
    expect(getDiagnosis).toHaveBeenCalledWith('projeto-1', 'perfil-a', 'diagnosis-1')
  })
})
