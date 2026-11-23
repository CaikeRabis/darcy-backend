import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
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
export const DARCY_E2E_KEYCHAIN_TIMEOUT_MS = 12_000

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

function helperPath(): string {
  return resolve(__dirname, '../../scripts/darcy-e2e-keychain-reader.swift')
}

function defaultRunner(): KeychainCommandRunner {
  return {
    run(args) {
      if (process.platform !== 'darwin') {
        throw new DarcyE2eSecretStoreError('KEYCHAIN_UNAVAILABLE', '[KEYCHAIN_UNAVAILABLE] O leitor nativo do macOS só pode ser usado no macOS.')
      }

      const result = spawnSync('/usr/bin/swift', [helperPath(), ...args], {
        encoding: 'utf8',
        timeout: DARCY_E2E_KEYCHAIN_TIMEOUT_MS,
        killSignal: 'SIGTERM',
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      if (result.error || result.status !== 0 || result.signal) {
        // Nunca transportar stdout/stderr do helper para a exceção.
        const processError = result.error as NodeJS.ErrnoException | undefined
        const code = processError?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM'
          ? 'KEYCHAIN_TIMEOUT'
          : 'KEYCHAIN_UNAVAILABLE'
        throw new DarcyE2eSecretStoreError(code, `[${code}] O segredo não pôde ser recuperado do armazenamento protegido.`)
      }

      return { stdout: String(result.stdout ?? ''), stderr: '' }
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
          '--account',
          DARCY_E2E_R1_KEYCHAIN_ACCOUNT,
          '--service',
          keychainService(name),
        ])
      } catch (error) {
        if (error instanceof DarcyE2eSecretStoreError) throw error
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
