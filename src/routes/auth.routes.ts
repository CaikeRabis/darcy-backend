import { Router, type Request, type Response } from 'express'
import { requireAuth } from '../middlewares/requireAuth'
import { ensureProfile, parseProfileInput, updateOwnProfile } from '../services/ProfileService'
import { isAdminProfileId } from '../config/adminAccess'

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
    const profile = await ensureProfile(request.authUser.id, request.authUser.userMetadata)

    response.status(200).json({
      ok: true,
      user: { id: request.authUser.id, email: request.authUser.email },
      profile,
      profileReady: true,
      authorization: { isAdmin: isAdminProfileId(request.authUser.id) },
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

router.patch('/me', requireAuth, async (request: Request, response: Response): Promise<void> => {
  if (!request.authUser) {
    response.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' },
    })
    return
  }

  try {
    const profile = await updateOwnProfile(request.authUser.id, parseProfileInput(request.body))
    response.status(200).json({ ok: true, profile })
  } catch (error: unknown) {
    if (error instanceof Error && (error.name === 'ZodError' || error.message.startsWith('Informe'))) {
      response.status(400).json({
        ok: false,
        error: { code: 'INVALID_PROFILE', message: 'Nome e telefone devem ser válidos.' },
      })
      return
    }

    response.status(500).json({
      ok: false,
      error: { code: 'PROFILE_SYNC_FAILED', message: 'Não foi possível atualizar o perfil.' },
    })
  }
})

export default router
