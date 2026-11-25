/**
 * Projeto: DARCY — Sistema Inteligente de Orientação Científica
 *
 * Autor: Caike Carvalho Rabis
 *
 * Titular dos direitos patrimoniais: Escrita com Ciência
 *
 * Copyright (c) 2026 Escrita com Ciência.
 *
 * Todos os direitos reservados.
 *
 * Consulte NOTICE.txt para informações de titularidade.
 */


import type { Request, Response } from 'express'
import { z } from 'zod'
import {
  ResumoAcademicoMilestoneRequestSchema,
  ResumoAcademicoProgressRequestSchema,
  ResumoAcademicoRestoreRequestSchema,
} from '../schemas/resumoAcademico.schema'
import {
  approveResumoAcademicoSection,
  consolidateResumoAcademico,
  getResumoAcademicoProgress,
  listOwnedResumoAcademicoHistory,
  restoreResumoAcademicoTextVersion,
  upsertResumoAcademicoProgress,
} from '../services/ResumoAcademicoService'
import {
  getOwnedResumoAcademicoTextVersion,
  listOwnedResumoAcademicoTextVersionMetadata,
} from '../services/ResumoAcademicoTextVersionService'
import { isScientificDiagnosisEnabled } from '../config/scientificDiagnosis'
import { ScientificDiagnosisService } from '../services/ScientificDiagnosisService'
import { runLimitedAiOperation } from '../middlewares/aiUsageLimit'
import { getOwnedScientificDiagnosis, listOwnedScientificDiagnoses, persistScientificDiagnosis } from '../services/ScientificDiagnosisPersistenceService'
import { ResumoAcademicoSection } from '@prisma/client'

const ProjectParamsSchema = z.object({
  projectId: z.string().min(1).max(100),
}).strict()

const SectionApprovalParamsSchema = ProjectParamsSchema.extend({
  section: z.nativeEnum(ResumoAcademicoSection),
}).strict()

const VersionRestoreParamsSchema = ProjectParamsSchema.extend({
  versionId: z.string().min(1).max(120),
}).strict()

const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  beforeSequence: z.coerce.number().int().min(1).optional(),
}).strict()

const VersionsQuerySchema = z.object({
  scopeKey: z.string().trim().min(1).max(120),
  section: z.nativeEnum(ResumoAcademicoSection).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  beforeVersionNumber: z.coerce.number().int().min(1).optional(),
}).strict()

const ScientificDiagnosisRequestSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  scope: z.literal('resumo'),
}).strict()

const ScientificDiagnosesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(25),
  beforeCreatedAt: z.string().datetime({ offset: true }).optional(),
}).strict()

function getAuthenticatedProfileId(request: Request): string | null {
  return request.authUser?.id ?? null
}

function sendUnauthorized(response: Response): void {
  response.status(401).json({
    ok: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Não autorizado.',
    },
  })
}

function sendValidationError(response: Response): void {
  response.status(400).json({
    ok: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Dados inválidos na requisição.',
    },
  })
}

function sendProjectNotFound(response: Response): void {
  response.status(404).json({
    ok: false,
    error: {
      code: 'PROJECT_NOT_FOUND',
      message: 'Projeto não encontrado.',
    },
  })
}

function sendProgressOperationError(response: Response): void {
  response.status(500).json({
    ok: false,
    error: {
      code: 'RESUMO_PROGRESS_OPERATION_FAILED',
      message: 'Não foi possível concluir a operação do progresso.',
    },
  })
}

function sendVersionNotFound(response: Response): void {
  response.status(404).json({
    ok: false,
    error: {
      code: 'TEXT_VERSION_NOT_FOUND',
      message: 'Versão textual não encontrada.',
    },
  })
}

function sendRevisionConflict(response: Response): void {
  response.status(409).json({
    ok: false,
    error: {
      code: 'RESUMO_PROGRESS_REVISION_CONFLICT',
      message: 'O progresso foi alterado em outra sessão. Recarregue a versão mais recente antes de salvar novamente.',
    },
  })
}

function sendInvalidMilestone(response: Response, message: string): void {
  response.status(422).json({
    ok: false,
    error: {
      code: 'RESUMO_ACADEMICO_MILESTONE_INVALID',
      message,
    },
  })
}

export class ResumoAcademicoController {
  static async scientificDiagnosis(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const bodyResult = ScientificDiagnosisRequestSchema.safeParse(request.body)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!isScientificDiagnosisEnabled()) {
      response.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' },
      })
      return
    }

    if (!paramsResult.success || !bodyResult.success) {
      sendValidationError(response)
      return
    }

    try {
      if (response.destroyed) return
      const result = await runLimitedAiOperation(response, () => new ScientificDiagnosisService(undefined, { persist: persistScientificDiagnosis }).diagnose(
        paramsResult.data.projectId,
        profileId,
        bodyResult.data.expectedRevision,
        bodyResult.data.scope,
      ))
      if (response.writableEnded || response.destroyed) return

      if (result.status === 'not_found') {
        sendProjectNotFound(response)
        return
      }
      if (result.status === 'conflict') {
        response.status(409).json({
          ok: false,
          error: {
            code: 'SCIENTIFIC_CONTEXT_REVISION_CONFLICT',
            message: 'O contexto científico foi alterado. Recarregue a versão mais recente antes de analisar novamente.',
          },
          revision: result.revision,
        })
        return
      }
      if (result.status === 'invalid_provider_response') {
        response.status(502).json({
          ok: false,
          error: { code: 'SCIENTIFIC_DIAGNOSIS_INVALID_RESPONSE', message: 'O diagnóstico não pôde ser validado.' },
        })
        return
      }
      if (result.status === 'provider_error') {
        response.status(502).json({
          ok: false,
          error: { code: result.code, message: result.message },
        })
        return
      }

      response.status(200).json({ ok: true, data: result.diagnosis })
    } catch {
      response.status(500).json({
        ok: false,
        error: { code: 'SCIENTIFIC_DIAGNOSIS_FAILED', message: 'Não foi possível gerar o diagnóstico científico.' },
      })
    }
  }

  static async listScientificDiagnoses(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const queryResult = ScientificDiagnosesQuerySchema.safeParse(request.query)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }
    if (!isScientificDiagnosisEnabled()) {
      response.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } })
      return
    }
    if (!paramsResult.success || !queryResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const page = await listOwnedScientificDiagnoses(paramsResult.data.projectId, profileId, queryResult.data)
      if (!page) {
        sendProjectNotFound(response)
        return
      }
      response.status(200).json({ ok: true, diagnoses: page })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async getScientificDiagnosis(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = z.object({
      projectId: z.string().min(1).max(100),
      diagnosisId: z.string().min(1).max(120),
    }).strict().safeParse(request.params)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }
    if (!isScientificDiagnosisEnabled()) {
      response.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } })
      return
    }
    if (!paramsResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const diagnosis = await getOwnedScientificDiagnosis(
        paramsResult.data.projectId,
        profileId,
        paramsResult.data.diagnosisId,
      )
      if (!diagnosis) {
        sendVersionNotFound(response)
        return
      }
      response.status(200).json({ ok: true, diagnosis })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async listVersions(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const queryResult = VersionsQuerySchema.safeParse(request.query)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success || !queryResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const page = await listOwnedResumoAcademicoTextVersionMetadata(
        paramsResult.data.projectId,
        profileId,
        queryResult.data,
      )

      if (!page) {
        sendProjectNotFound(response)
        return
      }

      response.status(200).json({ ok: true, versions: page })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async getVersion(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = z.object({
      projectId: z.string().min(1).max(100),
      versionId: z.string().min(1).max(100),
    }).strict().safeParse(request.params)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const version = await getOwnedResumoAcademicoTextVersion(
        paramsResult.data.projectId,
        profileId,
        paramsResult.data.versionId,
      )

      if (!version) {
        sendVersionNotFound(response)
        return
      }

      response.status(200).json({ ok: true, version })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async restoreVersion(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = VersionRestoreParamsSchema.safeParse(request.params)
    const bodyResult = ResumoAcademicoRestoreRequestSchema.safeParse(request.body)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success || !bodyResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const result = await restoreResumoAcademicoTextVersion(
        paramsResult.data.projectId,
        profileId,
        paramsResult.data.versionId,
        bodyResult.data.expectedRevision,
        bodyResult.data.operationId,
      )

      if (result === undefined) {
        sendProjectNotFound(response)
        return
      }
      if (result.status === 'conflict') {
        sendRevisionConflict(response)
        return
      }
      if (result.status === 'version_not_found') {
        sendVersionNotFound(response)
        return
      }
      if (result.status === 'invalid_restore') {
        sendInvalidMilestone(response, result.message)
        return
      }

      response.status(200).json({
        ok: true,
        progress: result.progress,
        revision: result.revision,
        versionId: result.versionId,
        eventId: result.eventId,
      })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async getHistory(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const queryResult = HistoryQuerySchema.safeParse(request.query)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success || !queryResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const history = await listOwnedResumoAcademicoHistory(
        paramsResult.data.projectId,
        profileId,
        queryResult.data.limit,
        queryResult.data.beforeSequence,
      )

      if (!history) {
        sendProjectNotFound(response)
        return
      }

      response.status(200).json({ ok: true, history })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async getProgress(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const progress = await getResumoAcademicoProgress(paramsResult.data.projectId, profileId)

      if (progress === undefined) {
        sendProjectNotFound(response)
        return
      }

      response.status(200).json({ ok: true, progress: progress.progress, revision: progress.revision })
    } catch {
      sendProgressOperationError(response)
    }
  }

  static async putProgress(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const bodyResult = ResumoAcademicoProgressRequestSchema.safeParse(request.body)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success || !bodyResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const result = await upsertResumoAcademicoProgress(
        paramsResult.data.projectId,
        profileId,
        bodyResult.data.progress,
        bodyResult.data.expectedRevision,
      )

      if (result === undefined) {
        sendProjectNotFound(response)
        return
      }

      if (result.status === 'conflict') {
        sendRevisionConflict(response)
        return
      }

      if (result.status === 'invalid_milestone') {
        sendInvalidMilestone(response, result.message)
        return
      }

      response.status(200).json({ ok: true, progress: result.progress, revision: result.revision })
    } catch {
      sendProgressOperationError(response)
    }
  }

  /**
   * Comando autenticado de aprovação. O PUT genérico continua reservado ao
   * autosave; somente esta rota cria o marco textual de aprovação.
   */
  static async approveSection(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = SectionApprovalParamsSchema.safeParse(request.params)
    const bodyResult = ResumoAcademicoMilestoneRequestSchema.safeParse(request.body)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success || !bodyResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const result = await approveResumoAcademicoSection(
        paramsResult.data.projectId,
        profileId,
        bodyResult.data.progress,
        bodyResult.data.expectedRevision,
        paramsResult.data.section,
      )

      if (result === undefined) {
        sendProjectNotFound(response)
        return
      }
      if (result.status === 'conflict') {
        sendRevisionConflict(response)
        return
      }
      if (result.status === 'invalid_milestone') {
        sendInvalidMilestone(response, result.message)
        return
      }

      response.status(200).json({ ok: true, progress: result.progress, revision: result.revision })
    } catch {
      sendProgressOperationError(response)
    }
  }

  /**
   * Comando autenticado de consolidação. A geração de IA continua fora deste
   * comando; ele apenas confirma o texto persistido pelo pesquisador.
   */
  static async consolidate(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)
    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const bodyResult = ResumoAcademicoMilestoneRequestSchema.safeParse(request.body)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    if (!paramsResult.success || !bodyResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const result = await consolidateResumoAcademico(
        paramsResult.data.projectId,
        profileId,
        bodyResult.data.progress,
        bodyResult.data.expectedRevision,
      )

      if (result === undefined) {
        sendProjectNotFound(response)
        return
      }
      if (result.status === 'conflict') {
        sendRevisionConflict(response)
        return
      }
      if (result.status === 'invalid_milestone') {
        sendInvalidMilestone(response, result.message)
        return
      }

      response.status(200).json({ ok: true, progress: result.progress, revision: result.revision })
    } catch {
      sendProgressOperationError(response)
    }
  }
}
