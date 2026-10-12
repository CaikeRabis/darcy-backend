import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middlewares/requireAuth'
import { ensureProfile } from '../services/ProfileService'

const router = Router()

router.get('/me', requireAuth, async (request: Request, response: Response): Promise<void> => {
  if (!request.authUser) {
    response.status(401).json({
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Não autorizado.',
      },
    })
    return
  }

  try {
    await ensureProfile(request.authUser.id)

    response.status(200).json({
      ok: true,
      user: request.authUser,
      profileReady: true,
    })
  } catch {
    response.status(500).json({
      ok: false,
      error: {
        code: 'PROFILE_SYNC_FAILED',
        message: 'Não foi possível preparar o perfil do usuário.',
      },
    })
  }
})

export default router
