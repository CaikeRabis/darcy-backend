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
import { ProjectsController } from '../controllers/ProjectsController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireProfile } from '../middlewares/requireProfile'

const router = Router()

router.post('/', requireAuth, requireProfile, ProjectsController.create)
router.get('/', requireAuth, requireProfile, ProjectsController.list)
router.get('/:projectId', requireAuth, requireProfile, ProjectsController.findById)
router.patch('/:projectId', requireAuth, requireProfile, ProjectsController.update)
router.delete('/:projectId', requireAuth, requireProfile, ProjectsController.delete)

export default router
