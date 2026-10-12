import { Router } from 'express'
import { ResumoAcademicoController } from '../controllers/ResumoAcademicoController'
import { requireAuth } from '../middlewares/requireAuth'
import { requireProfile } from '../middlewares/requireProfile'

const router = Router()

router.get('/:projectId', requireAuth, requireProfile, ResumoAcademicoController.getProgress)
router.put('/:projectId', requireAuth, requireProfile, ResumoAcademicoController.putProgress)

export default router
