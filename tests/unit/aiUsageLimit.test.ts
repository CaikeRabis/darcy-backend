import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Request, Response, NextFunction } from 'express'
import { createAiUsageLimit, runLimitedAiOperation, type AiLimitStore } from '../../src/middlewares/aiUsageLimit'

const previous = process.env.DARCY_AI_LIMITS_ENABLED
afterEach(() => {
  if (previous === undefined) delete process.env.DARCY_AI_LIMITS_ENABLED
  else process.env.DARCY_AI_LIMITS_ENABLED = previous
})

function harness() {
  const state: AiLimitStore = { users: new Map(), userActive: new Map(), active: 0 }
  let time = 0
  function call(route: 'chat' | 'quickAction' | 'diagnosis', userId = 'A') {
    const response = Object.assign(new EventEmitter(), {
      locals: {} as Record<string, unknown>,
      code: 200,
      headers: {} as Record<string, string>,
      body: undefined as unknown,
      status(code: number) { this.code = code; return this },
      setHeader(name: string, value: string) { this.headers[name] = value; return this },
      json(body: unknown) { this.body = body; (this as unknown as EventEmitter).emit('finish'); return this },
    })
    const next = vi.fn()
    createAiUsageLimit(route, state, () => time)(
      { authUser: { id: userId } } as Request,
      response as unknown as Response,
      next as NextFunction,
    )
    return { response, next }
  }
  return { state, call, advance(ms: number) { time += ms } }
}

describe('limite de operações de IA', () => {
  it('aceita abaixo do limite, rejeita a sétima quick action e libera após a janela', () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    const h = harness()
    for (let i = 0; i < 6; i += 1) {
      const result = h.call('quickAction')
      expect(result.next).toHaveBeenCalledOnce()
      result.response.emit('finish')
    }
    const refused = h.call('quickAction')
    expect(refused.response.code).toBe(429)
    expect(refused.response.headers['Retry-After']).toBe('60')
    expect(refused.next).not.toHaveBeenCalled()
    h.advance(60_000)
    expect(h.call('quickAction').next).toHaveBeenCalledOnce()
  })

  it('separa usuários e limites de rota', () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    const h = harness()
    for (let i = 0; i < 3; i += 1) h.call('diagnosis').response.emit('finish')
    expect(h.call('diagnosis').response.code).toBe(429)
    expect(h.call('diagnosis', 'B').next).toHaveBeenCalledOnce()
    expect(h.call('chat').next).toHaveBeenCalledOnce()
  })

  it('limita concorrência total por usuário entre rotas e devolve slots após erro ou cancelamento', () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    const h = harness()
    const first = h.call('chat')
    const second = h.call('diagnosis')
    expect(h.call('quickAction').response.code).toBe(429)
    first.response.emit('close')
    second.response.emit('finish')
    second.response.emit('close')
    expect(h.state.active).toBe(0)
    expect(h.call('quickAction').next).toHaveBeenCalledOnce()
  })

  it('rejeita configuração inválida e mantém a política inativa por padrão', () => {
    const h = harness()
    delete process.env.DARCY_AI_LIMITS_ENABLED
    expect(h.call('chat').next).toHaveBeenCalledOnce()
    process.env.DARCY_AI_LIMITS_ENABLED = 'invalid'
    expect(h.call('chat').response.code).toBe(503)
    expect(h.state.active).toBe(0)
  })

  it('aplica o teto global antes de chamar o próximo middleware', () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    process.env.DARCY_AI_PROCESS_CONCURRENCY = '1'
    try {
      const h = harness()
      const first = h.call('chat', 'A')
      const refused = h.call('diagnosis', 'B')
      expect(refused.response.code).toBe(429)
      expect(refused.next).not.toHaveBeenCalled()
      first.response.emit('finish')
      expect(h.call('diagnosis', 'B').next).toHaveBeenCalledOnce()
    } finally {
      delete process.env.DARCY_AI_PROCESS_CONCURRENCY
    }
  })

  it('falha fechado em limite configurado inválido', () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    process.env.DARCY_AI_CHAT_PER_MINUTE = '0'
    try {
      const result = harness().call('chat')
      expect(result.response.code).toBe(503)
      expect(result.next).not.toHaveBeenCalled()
    } finally {
      delete process.env.DARCY_AI_CHAT_PER_MINUTE
    }
  })

  it('mantém o slot após timeout e desconexão até o provider pendente terminar', async () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    vi.useFakeTimers()
    try {
      const h = harness()
      const first = h.call('chat')
      let complete!: (value: string) => void
      const pending = new Promise<string>((resolve) => { complete = resolve })
      const work = runLimitedAiOperation(first.response as unknown as Response, () => pending)
      first.response.emit('close')
      expect(h.state.active).toBe(1)
      vi.advanceTimersByTime(45_000)
      expect(h.state.active).toBe(1)
      const second = h.call('quickAction')
      const third = h.call('diagnosis')
      expect(second.next).toHaveBeenCalledOnce()
      expect(third.response.code).toBe(429)
      complete('ok')
      await expect(work).resolves.toBe('ok')
      expect(h.state.active).toBe(1)
      second.response.emit('finish')
      expect(h.state.active).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('libera o slot quando o provider rejeita, inclusive após fechamento HTTP', async () => {
    process.env.DARCY_AI_LIMITS_ENABLED = 'enabled'
    const h = harness()
    const first = h.call('chat')
    let reject!: (reason: Error) => void
    const pending = new Promise<void>((_, fail) => { reject = fail })
    const work = runLimitedAiOperation(first.response as unknown as Response, () => pending)
    first.response.emit('close')
    expect(h.state.active).toBe(1)
    reject(new Error('simulado'))
    await expect(work).rejects.toThrow('simulado')
    expect(h.state.active).toBe(0)
  })
})
