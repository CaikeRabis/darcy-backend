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

router.get('/:projectId', requireAuth, requireProfile, ResumoAcademicoController.getProgress)
router.put('/:projectId', requireAuth, requireProfile, ResumoAcademicoController.putProgress)

export default router
