import { describe, expect, it } from 'vitest'
import {
  assertNoOperationalMarker,
  assertProtectedSecretFileMetadata,
  DarcyE2eSecretStoreError,
  DARCY_E2E_R1_IDENTITY,
  resolveDarcyE2eR1Secrets,
  type DarcyE2eSecretReader,
} from '../../src/config/darcyE2eSecretStore'

type SecretFixtures = {
  DARCY_E2E_POSTGRES_PASSWORD: string
  DARCY_E2E_JWT_SECRET: string
}

const values: SecretFixtures = {
  DARCY_E2E_POSTGRES_PASSWORD: 'postgres-secret-only-in-test-memory',
  DARCY_E2E_JWT_SECRET: 'jwt-secret-only-in-test-memory',
}

function reader(overrides: Partial<typeof values> = {}): DarcyE2eSecretReader {
  const available = { ...values, ...overrides }
  return {
    read(name) {
      return available[name]
    },
  }
}

function request(mode: 'new' | 'resume' = 'resume') {
  return { stackId: DARCY_E2E_R1_IDENTITY.stackId, volumeId: DARCY_E2E_R1_IDENTITY.databaseVolume, mode }
}

describe('store abstrato de segredos E2E R1', () => {
  it('K01 aceita somente a identidade darcy-e2e-c0361-r1', () => {
    const result = resolveDarcyE2eR1Secrets(request(), reader())
    expect(result.stackId).toBe('darcy-e2e-c0361-r1')
    expect(result.volumeId).toBe('darcy-e2e-c0361-r1_db')
  })

  it('K02 rejeita a stack genérica ou a identidade original', () => {
    expect(() => resolveDarcyE2eR1Secrets({ ...request(), stackId: 'supabase' }, reader())).toThrowError('IDENTITY_MISMATCH')
    expect(() => resolveDarcyE2eR1Secrets({ ...request(), stackId: 'darcy-e2e-c0361' }, reader())).toThrowError('IDENTITY_MISMATCH')
  })

  it('K03 falha sem gerar segredo quando uma credencial está ausente', () => {
    expect(() => resolveDarcyE2eR1Secrets(request('new'), reader({ DARCY_E2E_JWT_SECRET: undefined }))).toThrowError('SECRET_UNAVAILABLE')
  })

  it('K04 usa erro sanitizado para segredo indisponível', () => {
    try {
      resolveDarcyE2eR1Secrets(request(), reader({ DARCY_E2E_POSTGRES_PASSWORD: undefined }))
      throw new Error('esperava falha')
    } catch (error) {
      expect(error).toBeInstanceOf(DarcyE2eSecretStoreError)
      expect(String(error)).not.toContain(values.DARCY_E2E_POSTGRES_PASSWORD)
    }
  })

  it('K05 rejeita volume pertencente a outra identidade', () => {
    expect(() => resolveDarcyE2eR1Secrets({ ...request(), volumeId: 'darcy-e2e-c0361_db' }, reader())).toThrowError('VOLUME_MISMATCH')
  })

  it('K06 reutiliza apenas segredos associados à mesma identidade no resume', () => {
    const seen: string[] = []
    const scopedReader: DarcyE2eSecretReader = {
      read(name, identity, mode) {
        seen.push(`${identity.stackId}:${mode}:${name}`)
        return values[name]
      },
    }
    resolveDarcyE2eR1Secrets(request('resume'), scopedReader)
    expect(seen).toEqual([
      'darcy-e2e-c0361-r1:resume:DARCY_E2E_POSTGRES_PASSWORD',
      'darcy-e2e-c0361-r1:resume:DARCY_E2E_JWT_SECRET',
    ])
  })

  it('K07 não seleciona implicitamente o volume antigo', () => {
    expect(() => resolveDarcyE2eR1Secrets({ ...request(), volumeId: 'darcy-e2e-c0361_db' }, reader())).toThrowError('VOLUME_MISMATCH')
  })

  it('K08 não expõe valores em erros ou representações', () => {
    expect(() => resolveDarcyE2eR1Secrets(request(), reader({ DARCY_E2E_JWT_SECRET: '<synthetic-local-jwt-secret>' }))).toThrowError('SECRET_PLACEHOLDER')
    expect(() => resolveDarcyE2eR1Secrets(request(), reader({ DARCY_E2E_JWT_SECRET: '<synthetic-local-jwt-secret>' }))).toThrowError(/placeholder/)
  })

  it('K09 não possui API para argumentos de processo sensíveis', () => {
    const result = resolveDarcyE2eR1Secrets(request('new'), reader())
    expect(result).not.toHaveProperty('command')
    expect(result).not.toHaveProperty('args')
  })

  it('K10 rejeita permissões abertas no fallback de arquivo', () => {
    expect(() => assertProtectedSecretFileMetadata({ exists: true, isSymbolicLink: false, ownerUid: 501, mode: 0o640 }, 501)).toThrowError('SECRET_FILE_PERMISSIONS')
    expect(() => assertProtectedSecretFileMetadata({ exists: true, isSymbolicLink: false, ownerUid: 501, mode: 0o600 }, 501)).not.toThrow()
  })

  it('K11 rejeita symlink no fallback de arquivo', () => {
    expect(() => assertProtectedSecretFileMetadata({ exists: true, isSymbolicLink: true, ownerUid: 501, mode: 0o600 }, 501)).toThrowError('SECRET_FILE_SYMLINK')
  })

  it('K12 não usa fallback quando a recuperação falha', () => {
    const failingReader: DarcyE2eSecretReader = { read: () => undefined }
    expect(() => resolveDarcyE2eR1Secrets(request('resume'), failingReader)).toThrowError('SECRET_UNAVAILABLE')
  })

  it('K13 é somente resolução e não cria infraestrutura', () => {
    const readerCalls: string[] = []
    resolveDarcyE2eR1Secrets(request('new'), {
      read(name) {
        readerCalls.push(name)
        return values[name]
      },
    })
    expect(readerCalls).toHaveLength(2)
  })

  it('K14 não fornece o marcador operacional', () => {
    const result = resolveDarcyE2eR1Secrets(request(), reader())
    expect(result).not.toHaveProperty('DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED')
    expect(() => assertNoOperationalMarker({})).not.toThrow()
    expect(() => assertNoOperationalMarker({ DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED: 'enabled' })).toThrowError('OPERATIONAL_MARKER_FORBIDDEN')
  })

  it('K15 mantém a identidade da infraestrutura separada do launcher existente', () => {
    expect(DARCY_E2E_R1_IDENTITY.stackId).not.toBe('darcy-e2e-c0361')
    expect(DARCY_E2E_R1_IDENTITY.databaseVolume).not.toBe('darcy-e2e-c0361_db')
  })
})
