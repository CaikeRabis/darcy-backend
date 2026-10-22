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


import type { RequestHandler } from 'express'
import { getSupabaseClient } from '../lib/supabase'

function sendUnauthorized(response: Parameters<RequestHandler>[1]): void {
  response.status(401).json({
    ok: false,
    error: {
      code: 'UNAUTHORIZED',
      message: 'Não autorizado.',
    },
  })
}

export const requireAuth: RequestHandler = async (request, response, next) => {
  const authorization = request.header('authorization')
  const match = authorization?.match(/^Bearer\s+(.+)$/i)

  if (!match) {
    sendUnauthorized(response)
    return
  }

  try {
    const { data, error } = await getSupabaseClient().auth.getUser(match[1])

    if (error || !data.user) {
      sendUnauthorized(response)
      return
    }

    request.authUser = {
      id: data.user.id,
      email: data.user.email,
    }
    next()
  } catch {
    sendUnauthorized(response)
  }
}
