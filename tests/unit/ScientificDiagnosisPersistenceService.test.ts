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

const section = () => ({ respostas_usuario: {}, diagnostico: '', lacunas: [], texto_sugerido: '', status: 'pendente' })
const approvedProgress = {
  titulo_provisorio: '', tema: '', area_conhecimento: '', nivel_academico: 'Mestrado', estagio_pesquisa: 'em_andamento',
  contexto: { ...section(), texto_sugerido: 'Texto aprovado', status: 'aprovado' },
  objetivo: section(), metodologia: section(), fundamentacao_teorica: section(), resultados: { ...section(), tipo: '' },
  resumo_completo: '', numero_palavras: 0, limite_palavras: 250,
  avaliacao_final: { coerencia: '', clareza: '', coesao: '', adequacao_academica: '', problemas_identificados: [], sugestoes: [] },
}

function approvedVersion(overrides: Record<string, unknown> = {}) {
  return { id: 'version-2', scopeKey: 'secao.contexto', section: 'contexto', content: 'Texto aprovado', sourceEventId: 'event-2',
    sourceEvent: { projectId: 'project-1', type: 'secao_aprovada', section: 'contexto', contentVersionRef: 'version-2' }, ...overrides }
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
    create: vi.fn().mockImplementation(async (input: { data: { diagnosis: ScientificDiagnosis; textVersionId: string | null } }) => row({
      diagnosis: input.data.diagnosis, textVersionId: input.data.textVersionId,
    })),
  }
  const overrideDiagnosisDatabase = overrides.resumoAcademicoScientificDiagnosis as Record<string, unknown> | undefined
  return {
    project: { findFirst: vi.fn().mockResolvedValue({ id: 'project-1' }) },
    resumoAcademicoProgress: { findUnique: vi.fn().mockResolvedValue({ revision: 2, progress: approvedProgress }) },
    resumoAcademicoTextVersion: { findMany: vi.fn().mockResolvedValue([approvedVersion()]) },
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

  it('associa apenas o marco formal da mesma revisão, com texto e evento verificáveis', async () => {
    const db = database()
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    const persisted = await persistScientificDiagnosis('project-1', 'profile-a', diagnosis)
    expect(persisted?.textVersionId).toBe('version-2')
    expect(persisted?.diagnosis.reviewState).toBe('formal_milestone')
    expect(db.resumoAcademicoScientificDiagnosis.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ textVersionId: 'version-2', diagnosis: expect.objectContaining({
        reviewState: 'formal_milestone', associatedVersionScope: 'secao.contexto',
      }) }),
    }))
  })

  it('não confunde autosave posterior ou restauração com aprovação', async () => {
    const db = database({ resumoAcademicoTextVersion: { findMany: vi.fn().mockResolvedValue([]) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    const persisted = await persistScientificDiagnosis('project-1', 'profile-a', diagnosis)
    expect(persisted?.textVersionId).toBeNull()
    expect(db.resumoAcademicoScientificDiagnosis.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ textVersionId: null, diagnosis: expect.objectContaining({ reviewState: 'working_draft' }) }),
    }))
  })

  it('oculta vínculos antigos que não possuem prova do marco formal', async () => {
    const result = await getOwnedScientificDiagnosis('project-1', 'profile-a', 'diagnosis-1')
    expect(result?.textVersionId).toBeNull()
    expect(result?.diagnosis.reviewState).toBeUndefined()
  })

  it('rejeita vínculo cujo texto ou backlink do evento não corresponde ao progresso', async () => {
    const db = database({ resumoAcademicoTextVersion: { findMany: vi.fn().mockResolvedValue([
      approvedVersion({ content: 'Texto antigo' }),
      approvedVersion({ sourceEvent: { projectId: 'project-1', type: 'secao_aprovada', section: 'contexto', contentVersionRef: 'outro-id' } }),
    ]) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    await persistScientificDiagnosis('project-1', 'profile-a', diagnosis)
    expect(db.resumoAcademicoScientificDiagnosis.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ textVersionId: null }),
    }))
  })

  it('não associa marco de seção fora do contexto analisado', async () => {
    const db = database({ resumoAcademicoTextVersion: { findMany: vi.fn().mockResolvedValue([
      approvedVersion({ scopeKey: 'secao.resultados', section: 'resultados', sourceEvent: {
        projectId: 'project-1', type: 'secao_aprovada', section: 'resultados', contentVersionRef: 'version-2',
      } }),
    ]) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    const result = await persistScientificDiagnosis('project-1', 'profile-a', diagnosis)
    expect(result?.textVersionId).toBeNull()
  })

  it('não reutiliza diagnóstico da mesma revisão com conteúdo analisado divergente', async () => {
    const hashA = 'a'.repeat(64)
    const hashB = 'b'.repeat(64)
    const db = database({ resumoAcademicoScientificDiagnosis: { findUnique: vi.fn().mockResolvedValue(row({
      diagnosis: { ...diagnosis, analyzedContentHash: hashA },
    })) } })
    transaction.mockImplementation((...args: unknown[]) => {
      const callback = args.find((item): item is (value: unknown) => unknown => typeof item === 'function')
      return callback?.(db)
    })
    await expect(persistScientificDiagnosis('project-1', 'profile-a', { ...diagnosis, analyzedContentHash: hashB }))
      .rejects.toBeInstanceOf(ScientificDiagnosisRevisionConflictError)
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
