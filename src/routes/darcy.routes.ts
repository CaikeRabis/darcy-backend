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
 * DARCY — Rotas da API
 * ═══════════════════════════════════════════════════════════════════
 * Registra os endpoints do DARCY no router do Express.
 *
 * Prefixo base (definido em server.ts): /api/darcy
 *
 * Endpoints disponíveis:
 *   GET  /api/darcy/health          → Liveness
 *   GET  /api/darcy/ready           → Readiness
 *   POST /api/darcy/chat            → Conversa principal com o DARCY
 *   POST /api/darcy/quick-action    → Ações rápidas do editor
 */

import { Router } from 'express'
import { DarcyController } from '../controllers/DarcyController'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// Health check — não requer autenticação
router.get('/health', DarcyController.health)
router.get('/ready', DarcyController.readiness)

// Chat principal — mensagem do pesquisador → resposta do DARCY.
// O serviço não depende de Profile/Project; o JWT validado é a identidade necessária.
router.post('/chat', requireAuth, DarcyController.chat)

// Ações Rápidas do editor (validar coerência, sugerir refs, etc.)
router.post('/quick-action', requireAuth, DarcyController.quickAction)

export default router
