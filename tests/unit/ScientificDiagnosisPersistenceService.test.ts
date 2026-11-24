import { beforeEach, describe, expect, it, vi } from 'vitest'

const transaction = vi.hoisted(() => vi.fn())
vi.mock('../../src/lib/prisma', () => ({ prisma: { $transaction: transaction } }))

import {
  getOwnedScientificDiagnosis,
  listOwnedScientificDiagnoses,
  persistScientificDiagnosis,
  ScientificDiagnosisRevisionConflictError,
} from '../../src/services/ScientificDiagnosisPersistenceService'
import type { ScientificDiagnosis } from '../../src/schemas/scientificDiagnosis.schema'

const diagnosis: ScientificDiagnosis = {
  projectId: 'project-1',
  analyzedRevision: 2,
  findings: [],
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'diagnosis-1', projectId: 'project-1', profileId: 'profile-a', scope: 'resumo',
    analyzedRevision: 2, diagnosis, textVersionId: 'version-2', createdAt: new Date('2026-11-24T12:00:00.000Z'),
    ...overrides,
  }
}

function database(overrides: Record<string, unknown> = {}) {
  const diagnosisDatabase = {
    findUnique: vi.fn().mockResolvedValue(null),
    findFirst: vi.fn().mockResolvedValue(row()),
    findMany: vi.fn().mockResolvedValue([row()]),
    create: vi.fn().mockResolvedValue(row()),
  }
  const overrideDiagnosisDatabase = overrides.resumoAcademicoScientificDiagnosis as Record<string, unknown> | undefined
  return {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
    resumoAcademicoProgress: { findUnique: vi.fn().mockResolvedValue({ revision: 2 }) },
    resumoAcademicoTextVersion: { findFirst: vi.fn().mockResolvedValue({ id: 'version-2' }) },
    resumoAcademicoScientificDiagnosis: { ...diagnosisDatabase, ...overrideDiagnosisDatabase },
    ...overrides,
  }
}

describe('ScientificDiagnosisPersistenceService', () => {
  beforeEach(() => transaction.mockReset().mockImplementation((...args: unknown[]) => {
    const callback = args.find((item): item is (db: unknown) => unknown => typeof item === 'function')
    return callback?.(database())
  }))

  it('persiste um diagnóstico somente no projeto de resumo pertencente ao perfil', async () => {
    const result = await persistScientificDiagnosis('project-1', 'profile-a', diagnosis)
    expect(result?.id).toBe('diagnosis-1')
  })

  it('deduplica pela tupla projeto, revisão e escopo', async () => {
    const db = database({ resumoAcademicoScientificDiagnosis: { findUnique: vi.fn().mockResolvedValue(row({ id: 'existing' })) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    await expect(persistScientificDiagnosis('project-1', 'profile-a', diagnosis)).resolves.toMatchObject({ id: 'existing' })
  })

  it('rejeita persistência quando a revisão mudou antes do commit', async () => {
    const db = database({ resumoAcademicoProgress: { findUnique: vi.fn().mockResolvedValue({ revision: 3 }) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    await expect(persistScientificDiagnosis('project-1', 'profile-a', diagnosis)).rejects.toBeInstanceOf(ScientificDiagnosisRevisionConflictError)
  })

  it('aplica ownership também na consulta individual e na lista', async () => {
    const db = database({ project: { findFirst: vi.fn().mockResolvedValue(null) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    await expect(getOwnedScientificDiagnosis('project-1', 'profile-b', 'diagnosis-1')).resolves.toBeUndefined()
    await expect(listOwnedScientificDiagnoses('project-1', 'profile-b')).resolves.toBeUndefined()
  })

  it('retorna paginação determinística sem expor a operação interna', async () => {
    const result = await listOwnedScientificDiagnoses('project-1', 'profile-a', { limit: 10 })
    expect(result?.diagnoses[0]).toMatchObject({ id: 'diagnosis-1', analyzedRevision: 2 })
    expect(result?.diagnoses[0]?.diagnosis).toEqual(diagnosis)
  })
})
