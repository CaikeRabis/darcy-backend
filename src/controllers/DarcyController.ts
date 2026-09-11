/**
 * DARCY — DarcyController
 * ═══════════════════════════════════════════════════════════════════
 * Responsável por:
 *   • Receber e validar requisições HTTP
 *   • Delegar ao GeminiService
 *   • Serializar respostas para o frontend
 *
 * Não contém lógica de negócio — apenas orquestração HTTP ↔ Service.
 */

import type { Request, Response } from 'express'
import { z } from 'zod'
import { GeminiService } from '../services/GeminiService'

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
    projectTitle: z.string().min(1),
    projectType: z.enum([
      'artigo', 'dissertacao', 'tese', 'tcc', 'projeto-pesquisa', 'resumo-academico',
    ]),
    currentPhase: z.enum([
      'tema', 'problema', 'referencial', 'metodologia', 'resultados', 'discussao', 'conclusao',
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

    console.log('[Backend] Recebeu - Body:', req.body)
    console.log('[Backend] Context Tema:', context.projectTitle)

    // 2. Delega ao serviço
    const service = GeminiService.getInstance()
    const result = await service.generateDarcyResponse(context, userMessage)

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

    const service = GeminiService.getInstance()
    const result = await service.executeQuickAction(actionId, context)

    if (!result.ok) {
      res.status(502).json(result)
      return
    }

    res.status(200).json(result)
  }

  /**
   * GET /api/darcy/health
   * Health check simples para monitoramento.
   */
  static health(_req: Request, res: Response): void {
    res.status(200).json({
      ok: true,
      data: {
        status: 'online',
        service: 'DARCY API',
        timestamp: new Date().toISOString(),
        geminiModel: 'gemini-1.5-flash',
      },
    })
  }
}
