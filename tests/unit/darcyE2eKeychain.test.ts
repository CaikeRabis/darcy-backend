import { describe, expect, it } from 'vitest'
import {
  createDarcyE2eR1KeychainReader,
  DARCY_E2E_R1_KEYCHAIN_ACCOUNT,
  DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX,
  resolveDarcyE2eR1KeychainSecrets,
  type KeychainCommandRunner,
} from '../../src/config/darcyE2eKeychain'
import { DARCY_E2E_R1_IDENTITY, DarcyE2eSecretStoreError } from '../../src/config/darcyE2eSecretStore'

function runnerFor(values: Record<string, string>): { runner: KeychainCommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run(args) {
        calls.push([...args])
        const service = args[args.indexOf('-s') + 1]
        return { stdout: values[service] ?? '' }
      },
    },
  }
}

describe('adaptador Keychain R1', () => {
  it('K01 usa conta e serviço exclusivos da identidade R1', () => {
    const { runner, calls } = runnerFor({
      [`${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_POSTGRES_PASSWORD`]: 'memory-only-postgres',
      [`${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_JWT_SECRET`]: 'memory-only-jwt',
    })
    const result = resolveDarcyE2eR1KeychainSecrets(createDarcyE2eR1KeychainReader({ runner }), 'new')
    expect(result.stackId).toBe(DARCY_E2E_R1_IDENTITY.stackId)
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual([
      'find-generic-password', '-a', DARCY_E2E_R1_KEYCHAIN_ACCOUNT,
      '-s', `${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_POSTGRES_PASSWORD`, '-w',
    ])
  })

  it('K02 não usa serviço genérico compartilhado', () => {
    expect(DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX).toContain(DARCY_E2E_R1_IDENTITY.stackId)
    expect(DARCY_E2E_R1_KEYCHAIN_ACCOUNT).not.toBe('supabase')
  })

  it('K03 rejeita segredo ausente', () => {
    const { runner } = runnerFor({})
    expect(() => resolveDarcyE2eR1KeychainSecrets(createDarcyE2eR1KeychainReader({ runner }), 'resume')).toThrowError('SECRET_UNAVAILABLE')
  })

  it('K04 rejeita placeholder', () => {
    const { runner } = runnerFor({
      [`${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_POSTGRES_PASSWORD`]: '<synthetic-local-password>',
      [`${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_JWT_SECRET`]: 'memory-only-jwt',
    })
    expect(() => resolveDarcyE2eR1KeychainSecrets(createDarcyE2eR1KeychainReader({ runner }), 'new')).toThrowError('SECRET_PLACEHOLDER')
  })

  it('K05 rejeita identidade divergente antes de consultar valores', () => {
    const { runner, calls } = runnerFor({})
    const reader = createDarcyE2eR1KeychainReader({ runner })
    expect(() => reader.read('DARCY_E2E_JWT_SECRET', { ...DARCY_E2E_R1_IDENTITY, stackId: 'supabase' } as unknown as typeof DARCY_E2E_R1_IDENTITY, 'resume')).toThrowError('IDENTITY_MISMATCH')
    expect(calls).toHaveLength(0)
  })

  it('K06 não imprime os valores recuperados', () => {
    const secret = 'private-value-only-in-mock'
    const { runner, calls } = runnerFor({
      [`${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_POSTGRES_PASSWORD`]: secret,
      [`${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.DARCY_E2E_JWT_SECRET`]: 'memory-only-jwt',
    })
    const result = resolveDarcyE2eR1KeychainSecrets(createDarcyE2eR1KeychainReader({ runner }), 'resume')
    expect(JSON.stringify(calls)).not.toContain(secret)
    expect(result.postgresPassword).toBe(secret)
  })

  it('K07 sanitiza falhas do runner', () => {
    const reader = createDarcyE2eR1KeychainReader({
      runner: { run: () => { throw new Error('raw-keychain-output') } },
    })
    try {
      reader.read('DARCY_E2E_JWT_SECRET', DARCY_E2E_R1_IDENTITY, 'resume')
      throw new Error('esperava falha')
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      expect(String(error)).not.toContain('raw-keychain-output')
    }
  })

  it('K08 não inclui segredos em argumentos', () => {
    const { runner, calls } = runnerFor({})
    const reader = createDarcyE2eR1KeychainReader({ runner })
    try { reader.read('DARCY_E2E_JWT_SECRET', DARCY_E2E_R1_IDENTITY, 'resume') } catch { /* esperado */ }
    expect(calls[0]).not.toContain('memory-only-jwt')
    expect(calls[0]).toContain('-w')
  })

  it('K09 não possui fallback de ambiente remoto', () => {
    const { runner } = runnerFor({})
    const reader = createDarcyE2eR1KeychainReader({ runner })
    expect(() => resolveDarcyE2eR1KeychainSecrets(reader, 'resume')).toThrowError('SECRET_UNAVAILABLE')
  })

  it('K10 é somente leitura e não oferece operações de gravação', () => {
    const { runner } = runnerFor({})
    const reader = createDarcyE2eR1KeychainReader({ runner })
    expect(reader).not.toHaveProperty('write')
    expect(reader).not.toHaveProperty('delete')
  })
})
