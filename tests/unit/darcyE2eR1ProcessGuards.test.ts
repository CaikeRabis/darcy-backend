import { describe, expect, it } from 'vitest'

// Os scripts são importados somente para exercitar os adaptadores com funções
// falsas; nenhum binário Docker, curl ou Prisma é executado nesta suíte.
const dockerVerifier = require('../../scripts/verify-darcy-e2e-r1-stack.cjs') as {
  runDocker: (args: readonly string[], exec?: (...args: any[]) => string) => string
  probeAuthHealth: (url: string, exec?: (...args: any[]) => string) => Record<string, unknown>
}
const prismaRunner = require('../../scripts/run-prisma-e2e.cjs') as {
  run: (command: string, args: readonly string[], env: NodeJS.ProcessEnv, cwd: string, timeout?: number, exec?: (...args: any[]) => unknown) => void
  timeoutFor: (args: readonly string[]) => number
  TIMEOUTS_MS: Record<string, number>
}

describe('limites dos processos do verificador E2E R1', () => {
  it('T01/T03 falha fechada e sanitizada para Docker travado ou com erro', () => {
    expect(() => dockerVerifier.runDocker(['info'], () => { throw Object.assign(new Error('password=synthetic'), { code: 'ETIMEDOUT' }) })).toThrow('evidência operacional')
    expect(() => dockerVerifier.runDocker(['info'], () => { throw new Error('token=synthetic') })).not.toThrowError(/synthetic/)
  })

  it('T02/T08 aplica timeout, limite de saída e encerramento ao Docker', () => {
    let options: Record<string, unknown> | undefined
    const result = dockerVerifier.runDocker(['info'], (_command: string, _args: readonly string[], received: Record<string, unknown>) => {
      options = received
      return '{}'
    })
    expect(result).toBe('{}')
    expect(options).toMatchObject({ timeout: 10000, maxBuffer: 256 * 1024, killSignal: 'SIGTERM' })
    expect(() => dockerVerifier.runDocker(['info'], () => {
      throw Object.assign(new Error('stdout too large'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })
    })).toThrow('evidência operacional')
  })

  it('T04/T05/T06/T07 aplica limites distintos e não repete Prisma após timeout', () => {
    expect(prismaRunner.timeoutFor(['validate'])).toBe(15000)
    expect(prismaRunner.timeoutFor(['migrate', 'status'])).toBe(30000)
    expect(prismaRunner.timeoutFor(['migrate', 'deploy'])).toBe(120000)
    const exec = () => { throw Object.assign(new Error('secret=synthetic'), { code: 'ETIMEDOUT' }) }
    expect(() => prismaRunner.run('node', ['migrate', 'deploy'], {}, '/tmp', undefined, exec)).toThrow('estado da operação é indeterminado')
    expect(() => prismaRunner.run('node', ['validate'], {}, '/tmp', undefined, () => {
      throw Object.assign(new Error('stdout too large'), { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' })
    })).toThrow('saída foi omitida')
    expect(() => prismaRunner.run('node', ['validate'], {}, '/tmp', undefined, () => { throw new Error('secret=synthetic') })).toThrow('saída foi omitida')
  })

  it('health parser impõe limite e rejeita resposta vazia ou HTML', () => {
    let options: Record<string, unknown> | undefined
    const valid = dockerVerifier.probeAuthHealth('http://127.0.0.1:55521/auth/v1/health', (_command: string, _args: readonly string[], received: Record<string, unknown>) => {
      options = received
      return 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"version":"v2","name":"GoTrue","description":"Auth"}\nDARCY_HTTP_STATUS:200\n'
    })
    expect(valid).toMatchObject({ status: 200, contentType: 'application/json' })
    expect(options).toMatchObject({ timeout: 6000, maxBuffer: 64 * 1024, killSignal: 'SIGTERM' })

    const invalid = dockerVerifier.probeAuthHealth('http://127.0.0.1:55521/auth/v1/health', () => 'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<html>not auth</html>\nDARCY_HTTP_STATUS:200\n')
    expect(invalid).toMatchObject({ status: 200, body: null })
  })
})
