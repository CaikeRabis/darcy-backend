import { Socket } from 'node:net'
import { assertE2EOperationalIdentity } from './e2eEnvironment'

let installed = false

/** Rede do processo E2E: só loopback e o Auth do projeto Supabase validado. */
export function installE2EOutboundGuard(environmentVariables: NodeJS.ProcessEnv = process.env): void {
  const identity = assertE2EOperationalIdentity(environmentVariables)
  if (!identity) return
  if (installed) return

  const supabaseHost = new URL(environmentVariables.SUPABASE_URL ?? '').hostname.toLowerCase()
  const allowed = new Set(['localhost', '127.0.0.1', '::1', supabaseHost])
  const originalConnect = Socket.prototype.connect

  Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
    // Undici/Node também encaminha a assinatura normalizada [options, callback].
    // Validar o objeto interno preserva a lista fechada de destinos permitidos.
    const target = Array.isArray(args[0]) ? args[0][0] : args[0]
    const host = typeof target === 'object' && target !== null
      ? ('host' in target ? String(target.host ?? 'localhost') : '')
      : typeof target === 'number'
        ? (typeof args[1] === 'string' ? args[1] : 'localhost')
        : ''
    if (!allowed.has(host.toLowerCase())) {
      // Nunca incluir host ou URL no erro: podem conter dados sensíveis.
      throw new Error('Conexão de saída bloqueada pela política E2E.')
    }
    return Reflect.apply(originalConnect, this, args) as Socket
  } as typeof originalConnect

  installed = true
}
