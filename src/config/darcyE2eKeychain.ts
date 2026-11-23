import { execFileSync } from 'node:child_process'
import {
  DARCY_E2E_R1_IDENTITY,
  type DarcyE2eR1SecretName,
  type DarcyE2eSecretMode,
  type DarcyE2eSecretReader,
  type ProtectedSecretFileMetadata,
  assertProtectedSecretFileMetadata,
  resolveDarcyE2eR1Secrets,
} from './darcyE2eSecretStore'
import { DarcyE2eSecretStoreError } from './darcyE2eSecretStore'

export const DARCY_E2E_R1_KEYCHAIN_ACCOUNT = 'darcy-e2e-c0361-r1'
export const DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX = 'com.escritacomciencia.darcy.e2e.darcy-e2e-c0361-r1'

export interface KeychainCommandResult {
  stdout: string
  stderr?: string
}

export interface KeychainCommandRunner {
  run(args: readonly string[]): KeychainCommandResult
}

export interface DarcyE2eKeychainReaderOptions {
  runner?: KeychainCommandRunner
}

function keychainService(name: DarcyE2eR1SecretName): string {
  return `${DARCY_E2E_R1_KEYCHAIN_SERVICE_PREFIX}.${name}`
}

function defaultRunner(): KeychainCommandRunner {
  return {
    run(args) {
      try {
        const stdout = execFileSync('security', args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
        return { stdout: String(stdout), stderr: '' }
      } catch {
        // Nunca transportar stdout/stderr do Keychain para a exceção.
        throw new DarcyE2eSecretStoreError('KEYCHAIN_UNAVAILABLE', '[KEYCHAIN_UNAVAILABLE] O segredo não pôde ser recuperado do armazenamento protegido.')
      }
    },
  }
}

/**
 * Cria somente um leitor. Nenhum comando é executado até read() ser chamado
 * por um processo autorizado. O leitor nunca implementa gravação ou exclusão.
 */
export function createDarcyE2eR1KeychainReader(
  options: DarcyE2eKeychainReaderOptions = {},
): DarcyE2eSecretReader {
  const runner = options.runner ?? defaultRunner()

  return {
    read(name: DarcyE2eR1SecretName, identity, _mode: DarcyE2eSecretMode): string | undefined {
      if (identity.stackId !== DARCY_E2E_R1_IDENTITY.stackId) {
        throw new DarcyE2eSecretStoreError('IDENTITY_MISMATCH', '[IDENTITY_MISMATCH] A identidade do Keychain não corresponde à stack R1.')
      }

      let result: KeychainCommandResult
      try {
        result = runner.run([
          'find-generic-password',
          '-a',
          DARCY_E2E_R1_KEYCHAIN_ACCOUNT,
          '-s',
          keychainService(name),
          '-w',
        ])
      } catch {
        throw new DarcyE2eSecretStoreError('KEYCHAIN_UNAVAILABLE', '[KEYCHAIN_UNAVAILABLE] O segredo não pôde ser recuperado do armazenamento protegido.')
      }
      const value = result.stdout.trim()
      return value.length > 0 ? value : undefined
    },
  }
}

/** Resolve a configuração sem fornecer o marcador operacional. */
export function resolveDarcyE2eR1KeychainSecrets(
  reader: DarcyE2eSecretReader,
  mode: DarcyE2eSecretMode,
) {
  return resolveDarcyE2eR1Secrets(
    {
      stackId: DARCY_E2E_R1_IDENTITY.stackId,
      volumeId: DARCY_E2E_R1_IDENTITY.databaseVolume,
      mode,
    },
    reader,
  )
}

export { assertProtectedSecretFileMetadata }
export type { ProtectedSecretFileMetadata }
