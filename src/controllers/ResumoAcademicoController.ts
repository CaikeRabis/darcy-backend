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
import { ResumoAcademicoProgressRequestSchema } from '../schemas/resumoAcademico.schema'
import {
  getResumoAcademicoProgress,
  upsertResumoAcademicoProgress,
} from '../services/ResumoAcademicoService'

const ProjectParamsSchema = z.object({
  projectId: z.string().min(1).max(100),
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

export class ResumoAcademicoController {
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

      response.status(200).json({ ok: true, progress })
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
      const progress = await upsertResumoAcademicoProgress(
        paramsResult.data.projectId,
        profileId,
        bodyResult.data.progress,
      )

      if (progress === undefined) {
        sendProjectNotFound(response)
        return
      }

      response.status(200).json({ ok: true, progress })
    } catch {
      sendProgressOperationError(response)
    }
  }
}
