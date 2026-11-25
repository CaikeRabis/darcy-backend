import type { RequestHandler, Response } from 'express'

type Route = 'chat' | 'quickAction' | 'diagnosis'
type Entry = { started: number[]; active: number }

export interface AiLimitStore {
  users: Map<string, Entry>
  userActive: Map<string, number>
  active: number
}

const store: AiLimitStore = { users: new Map(), userActive: new Map(), active: 0 }
const defaults = { chat: 10, quickAction: 6, diagnosis: 3 } as const
const windowMs = 60_000
const userConcurrency = 2
const processConcurrency = 10
const maxTrackedKeys = 10_000
const operationDeadlineMs = 45_000

type LimitedResponse = Response & { locals: Record<string, unknown> }

export async function runLimitedAiOperation<T>(response: Response, operation: () => Promise<T>): Promise<T> {
  const local = (response as LimitedResponse).locals
  const begin = local?.aiUsageBegin
  const end = local?.aiUsageEnd
  if (typeof begin === 'function') (begin as () => void)()
  try {
    return await operation()
  } finally {
    if (typeof end === 'function') (end as () => void)()
  }
}

function limit(name: string, fallback: number): number | undefined {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  if (!/^[1-9]\d*$/.test(raw)) return undefined
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed <= 100 ? parsed : undefined
}

export function createAiUsageLimit(route: Route, state: AiLimitStore = store, now: () => number = Date.now): RequestHandler {
  return (request, response, next) => {
    const setting = process.env.DARCY_AI_LIMITS_ENABLED
    if (setting !== undefined && setting !== 'enabled' && setting !== 'disabled') {
      response.status(503).json({ ok: false, error: { code: 'AI_LIMIT_CONFIGURATION_ERROR', message: 'Controle de uso indisponível.' } })
      return
    }
    if (setting !== 'enabled') { next(); return }
    const routeLimit = limit(`DARCY_AI_${route === 'quickAction' ? 'QUICK_ACTION' : route.toUpperCase()}_PER_MINUTE`, defaults[route])
    const perUser = limit('DARCY_AI_USER_CONCURRENCY', userConcurrency)
    const perProcess = limit('DARCY_AI_PROCESS_CONCURRENCY', processConcurrency)
    if (!routeLimit || !perUser || !perProcess) {
      response.status(503).json({ ok: false, error: { code: 'AI_LIMIT_CONFIGURATION_ERROR', message: 'Controle de uso indisponível.' } })
      return
    }
    const userId = request.authUser?.id
    if (!userId) {
      response.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Não autorizado.' } })
      return
    }
    const timestamp = now()
    const key = `${route}:${userId}`
    for (const [id, value] of state.users) {
      value.started = value.started.filter((start) => timestamp - start < windowMs)
      if (value.started.length === 0 && value.active === 0) state.users.delete(id)
    }
    const entry = state.users.get(key) ?? { started: [], active: 0 }
    const fullWindow = entry.started.length >= routeLimit
    const busy = (state.userActive.get(userId) ?? 0) >= perUser || state.active >= perProcess || (state.users.size >= maxTrackedKeys && !state.users.has(key))
    if (fullWindow || busy) {
      const retry = fullWindow ? Math.max(1, Math.ceil((entry.started[0] + windowMs - timestamp) / 1000)) : 1
      response.setHeader('Retry-After', String(retry))
      response.status(429).json({ ok: false, error: { code: 'AI_USAGE_LIMIT', message: 'Aguarde um momento antes de solicitar nova orientação.' } })
      return
    }
    entry.started.push(timestamp)
    entry.active += 1
    state.userActive.set(userId, (state.userActive.get(userId) ?? 0) + 1)
    state.active += 1
    state.users.set(key, entry)
    let released = false
    let operationStarted = false
    let operationFinished = false
    let responseClosed = false
    let deadline: ReturnType<typeof setTimeout> | undefined
    const release = () => {
      if (released) return
      released = true
      entry.active -= 1
      const remaining = (state.userActive.get(userId) ?? 1) - 1
      if (remaining === 0) state.userActive.delete(userId)
      else state.userActive.set(userId, remaining)
      state.active -= 1
    }
    response.locals.aiUsageBegin = () => {
      operationStarted = true
      deadline = setTimeout(() => {
        if (!response.headersSent && !responseClosed) {
          response.status(504).json({ ok: false, error: { code: 'AI_OPERATION_TIMEOUT', message: 'A orientação demorou além do esperado. Tente novamente mais tarde.' } })
        }
      }, operationDeadlineMs)
      deadline.unref?.()
    }
    response.locals.aiUsageEnd = () => {
      operationFinished = true
      if (deadline) clearTimeout(deadline)
      release()
    }
    const onResponseEnd = () => {
      responseClosed = true
      // Um SDK pendente continua ocupando capacidade mesmo após desconexão ou 504.
      if (!operationStarted || operationFinished) release()
    }
    response.once('finish', onResponseEnd)
    response.once('close', onResponseEnd)
    next()
  }
}
