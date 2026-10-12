import type { Request, Response } from 'express'
import { z } from 'zod'
import {
  createProject,
  deleteOwnedProject,
  findProjectByIdAndOwner,
  listProjectsByOwner,
  updateOwnedProject,
} from '../services/ProjectService'

const ProjectTypeSchema = z.enum([
  'artigo',
  'dissertacao',
  'tese',
  'tcc',
  'projeto-pesquisa',
  'resumo-academico',
])

const CreateProjectRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  field: z.string().trim().min(1).max(200),
  type: ProjectTypeSchema,
}).strict()

const UpdateProjectRequestSchema = CreateProjectRequestSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0)

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

function sendProjectOperationError(response: Response): void {
  response.status(500).json({
    ok: false,
    error: {
      code: 'PROJECT_OPERATION_FAILED',
      message: 'Não foi possível concluir a operação do projeto.',
    },
  })
}

export class ProjectsController {
  static async create(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    const parseResult = CreateProjectRequestSchema.safeParse(request.body)
    if (!parseResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const project = await createProject(profileId, parseResult.data)
      response.status(201).json({ ok: true, project })
    } catch {
      sendProjectOperationError(response)
    }
  }

  static async list(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    try {
      const projects = await listProjectsByOwner(profileId)
      response.status(200).json({ ok: true, projects })
    } catch {
      sendProjectOperationError(response)
    }
  }

  static async findById(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    const parseResult = ProjectParamsSchema.safeParse(request.params)
    if (!parseResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const project = await findProjectByIdAndOwner(parseResult.data.projectId, profileId)

      if (!project) {
        sendProjectNotFound(response)
        return
      }

      response.status(200).json({ ok: true, project })
    } catch {
      sendProjectOperationError(response)
    }
  }

  static async update(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    const bodyResult = UpdateProjectRequestSchema.safeParse(request.body)

    if (!paramsResult.success || !bodyResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const project = await updateOwnedProject(
        paramsResult.data.projectId,
        profileId,
        bodyResult.data,
      )

      if (!project) {
        sendProjectNotFound(response)
        return
      }

      response.status(200).json({ ok: true, project })
    } catch {
      sendProjectOperationError(response)
    }
  }

  static async delete(request: Request, response: Response): Promise<void> {
    const profileId = getAuthenticatedProfileId(request)

    if (!profileId) {
      sendUnauthorized(response)
      return
    }

    const paramsResult = ProjectParamsSchema.safeParse(request.params)
    if (!paramsResult.success) {
      sendValidationError(response)
      return
    }

    try {
      const wasDeleted = await deleteOwnedProject(paramsResult.data.projectId, profileId)

      if (!wasDeleted) {
        sendProjectNotFound(response)
        return
      }

      response.status(204).send()
    } catch {
      sendProjectOperationError(response)
    }
  }
}
