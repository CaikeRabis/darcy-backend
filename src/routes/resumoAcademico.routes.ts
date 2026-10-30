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


import { Router } from 'express'
import { ResumoAcademicoController } from '../controllers/ResumoAcademicoController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireProfile } from '../middlewares/requireProfile'

const router = Router()

router.get('/:projectId/history', requireAuth, requireProfile, ResumoAcademicoController.getHistory)
router.get('/:projectId', requireAuth, requireProfile, ResumoAcademicoController.getProgress)
router.put('/:projectId', requireAuth, requireProfile, ResumoAcademicoController.putProgress)
// Comandos explícitos; o PUT acima permanece reservado ao autosave.
router.post('/:projectId/sections/:section/approve', requireAuth, requireProfile, ResumoAcademicoController.approveSection)
router.post('/:projectId/consolidate', requireAuth, requireProfile, ResumoAcademicoController.consolidate)

export default router
