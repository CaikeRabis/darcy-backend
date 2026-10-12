import type { RequestHandler } from 'express'
import { ensureProfile } from '../services/ProfileService'

export const requireProfile: RequestHandler = async (request, response, next) => {
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
    next()
  } catch {
    response.status(500).json({
      ok: false,
      error: {
        code: 'PROFILE_SYNC_FAILED',
        message: 'Não foi possível preparar o perfil do usuário.',
      },
    })
  }
}
