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


/**
 * DARCY — DarcyController
 * ═══════════════════════════════════════════════════════════════════
 * Responsável por:
 *   • Receber e validar requisições HTTP
 *   • Delegar ao AIService
 *   • Serializar respostas para o frontend
 *
 * Não contém lógica de negócio — apenas orquestração HTTP ↔ Service.
 */

import type { Request, Response } from 'express'
import { z } from 'zod'
import { verifyDatabaseReadiness } from '../lib/readiness'
import { getE2EEnvironmentIdentity } from '../config/e2eEnvironment'
import { AIService } from '../services/ai/AIService'
import { getOwnedResumoScientificContext } from '../services/ResumoAcademicoService'
import type { ProjectContext } from '../types/darcy.types'

/* ------------------------------------------------------------------ */
/* Schemas de validação (Zod)                                          */
/* ------------------------------------------------------------------ */

const ConversationMessageSchema = z.object({
  role: z.enum(['user', 'model']),
  content: z.string().min(1),
})

/**
 * Body esperado na rota POST /api/darcy/chat
 */
const ChatRequestSchema = z.object({
  userMessage: z
    .string()
    .min(1, 'A mensagem não pode estar vazia.')
    .max(4000, 'Mensagem muito longa.'),
  context: z.object({
    projectId: z.string().min(1).max(100).optional(),
    projectTitle: z.string().min(1),
    projectType: z.enum([
      'artigo', 'dissertacao', 'tese', 'tcc', 'projeto-pesquisa', 'resumo-academico',
    ]),
    currentPhase: z.enum([
      'tema', 'problema', 'referencial', 'metodologia', 'resultados', 'discussao', 'conclusao', 'resumo-academico',
    ]),
    activeSectionContent: z.string().optional(),
    researchField: z.string().optional(),
    conversationHistory: z.array(ConversationMessageSchema).optional(),
  }),
})

/**
 * Body esperado na rota POST /api/darcy/quick-action
 */
const QuickActionRequestSchema = z.object({
  actionId: z.enum([
    'validar-coerencia',
    'sugerir-referencias',
    'checar-objetivos',
    'revisar-clareza',
    'identificar-lacunas',
  ]),
  context: ChatRequestSchema.shape.context,
})

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */

export class DarcyController {

  /**
   * Para projetos, o contexto científico vem apenas do JSONB pertencente ao
   * usuário autenticado. O campo livre recebido do cliente não é autoridade.
   */
  private static async getAuthenticatedProjectContext(
    context: ProjectContext,
    profileId: string,
  ): Promise<ProjectContext | undefined> {
    if (!context.projectId) return context

    const scientificContext = await getOwnedResumoScientificContext(context.projectId, profileId)
    if (!scientificContext) return undefined

    const { researchField: _untrustedResearchField, ...trustedContext } = context
    return {
      ...trustedContext,
      ...(scientificContext.decisaoAutoralContextual
        ? { decisaoAutoralContextual: scientificContext.decisaoAutoralContextual }
        : {}),
      ...(scientificContext.classificacaoCnpqContextual
        ? { classificacaoCnpqContextual: scientificContext.classificacaoCnpqContextual }
        : {}),
    }
  }

  /**
   * POST /api/darcy/chat
   * Processa uma mensagem do pesquisador e retorna a resposta do DARCY.
   */
  static async chat(req: Request, res: Response): Promise<void> {
    // 1. Validação do body
    const parseResult = ChatRequestSchema.safeParse(req.body)

    if (!parseResult.success) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos na requisição.',
          details: parseResult.error.flatten().fieldErrors,
        },
      })
      return
    }

    const { userMessage, context } = parseResult.data
    let contextualizedContext: ProjectContext | undefined

    if (context.projectId) {
      try {
        contextualizedContext = await DarcyController.getAuthenticatedProjectContext(context, req.authUser!.id)
        if (!contextualizedContext) {
          res.status(404).json({
            ok: false,
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: 'Projeto não encontrado.',
            },
          })
          return
        }

      } catch {
        res.status(500).json({
          ok: false,
          error: {
            code: 'PROJECT_CONTEXT_UNAVAILABLE',
            message: 'Não foi possível recuperar o contexto do projeto.',
          },
        })
        return
      }
    } else {
      contextualizedContext = context
    }

    // 2. Delega ao serviço
    const service = AIService.getInstance()
    const result = await service.generateDarcyResponse(contextualizedContext, userMessage)

    // 3. Serializa a resposta
    if (!result.ok) {
      res.status(502).json(result)
      return
    }

    res.status(200).json(result)
  }

  /**
   * POST /api/darcy/quick-action
   * Executa uma Ação Rápida do editor (análise, revisão, etc.).
   */
  static async quickAction(req: Request, res: Response): Promise<void> {
    const parseResult = QuickActionRequestSchema.safeParse(req.body)

    if (!parseResult.success) {
      res.status(400).json({
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos na requisição.',
          details: parseResult.error.flatten().fieldErrors,
        },
      })
      return
    }

    const { actionId, context } = parseResult.data
    let contextualizedContext: ProjectContext | undefined

    if (context.projectId) {
      try {
        contextualizedContext = await DarcyController.getAuthenticatedProjectContext(context, req.authUser!.id)
        if (!contextualizedContext) {
          res.status(404).json({
            ok: false,
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: 'Projeto não encontrado.',
            },
          })
          return
        }
      } catch {
        res.status(500).json({
          ok: false,
          error: {
            code: 'PROJECT_CONTEXT_UNAVAILABLE',
            message: 'Não foi possível recuperar o contexto do projeto.',
          },
        })
        return
      }
    } else {
      contextualizedContext = context
    }

    const service = AIService.getInstance()
    const result = await service.executeQuickAction(actionId, contextualizedContext)

    if (!result.ok) {
      res.status(502).json(result)
      return
    }

    res.status(200).json(result)
  }

  /**
   * GET /api/darcy/health
   * Liveness: confirma somente que o processo HTTP está em execução.
   */
  static health(_req: Request, res: Response): void {
    const e2eEnvironment = getE2EEnvironmentIdentity()

    res.status(200).json({
      ok: true,
      data: {
        status: 'alive',
        ...(e2eEnvironment ? { e2eEnvironment } : {}),
      },
    })
  }

  /**
   * GET /api/darcy/ready
   * Readiness: confirma que a dependência de banco necessária ao domínio responde.
   */
  static async readiness(_req: Request, res: Response): Promise<void> {
    try {
      await verifyDatabaseReadiness()
      res.status(200).json({
        ok: true,
        data: {
          status: 'ready',
        },
      })
    } catch {
      res.status(503).json({
        ok: false,
        error: {
          code: 'NOT_READY',
          message: 'Serviço indisponível temporariamente.',
        },
      })
    }
  }
}
