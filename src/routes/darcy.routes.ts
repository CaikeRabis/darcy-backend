/**
 * DARCY — Rotas da API
 * ═══════════════════════════════════════════════════════════════════
 * Registra os endpoints do DARCY no router do Express.
 *
 * Prefixo base (definido em server.ts): /api/darcy
 *
 * Endpoints disponíveis:
 *   GET  /api/darcy/health          → Health check
 *   POST /api/darcy/chat            → Conversa principal com o DARCY
 *   POST /api/darcy/quick-action    → Ações rápidas do editor
 */

import { Router } from 'express'
import { DarcyController } from '../controllers/DarcyController'

const router = Router()

// Health check — não requer autenticação
router.get('/health', DarcyController.health)

// Chat principal — mensagem do pesquisador → resposta do DARCY
router.post('/chat', DarcyController.chat)

// Ações Rápidas do editor (validar coerência, sugerir refs, etc.)
router.post('/quick-action', DarcyController.quickAction)

export default router
