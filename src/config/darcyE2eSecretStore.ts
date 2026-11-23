/**
 * Contrato local para segredos sintéticos da stack DARCY E2E R1.
 *
 * Este módulo não acessa Keychain, arquivos de segredos ou Docker. A leitura é
 * injetada pelo processo autorizado que vier a integrar o contrato futuramente.
 * Assim, a validação pode ser exercitada sem criar ou expor credenciais reais.
 */

export const DARCY_E2E_R1_IDENTITY = {
  stackId: 'darcy-e2e-c0361-r1',
  composeProject: 'darcy-e2e-c0361-r1',
  databaseVolume: 'darcy-e2e-c0361-r1_db',
  network: 'darcy-e2e-c0361-r1_network',
} as const

export const DARCY_E2E_R1_SECRET_NAMES = [
  'DARCY_E2E_POSTGRES_PASSWORD',
  'DARCY_E2E_JWT_SECRET',
] as const

export type DarcyE2eR1SecretName = typeof DARCY_E2E_R1_SECRET_NAMES[number]
export type DarcyE2eSecretMode = 'new' | 'resume'

export interface DarcyE2eSecretRequest {
  stackId: string
  volumeId: string
  mode: DarcyE2eSecretMode
}

export interface DarcyE2eSecretReader {
  /**
   * Recupera um valor somente no processo autorizado. Implementações reais
   * devem ler um Keychain/cofre protegido sem incluir o valor em argumentos,
   * logs ou mensagens de erro.
   */
  read(
    name: DarcyE2eR1SecretName,
    identity: typeof DARCY_E2E_R1_IDENTITY,
    mode: DarcyE2eSecretMode,
  ): string | undefined
}

export interface DarcyE2eSecretConfiguration {
  readonly stackId: typeof DARCY_E2E_R1_IDENTITY.stackId
  readonly volumeId: typeof DARCY_E2E_R1_IDENTITY.databaseVolume
  readonly mode: DarcyE2eSecretMode
  readonly postgresPassword: string
  readonly jwtSecret: string
}

export interface ProtectedSecretFileMetadata {
  exists: boolean
  isSymbolicLink: boolean
  ownerUid: number
  mode: number
}

export class DarcyE2eSecretStoreError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'DarcyE2eSecretStoreError'
  }
}

function fail(code: string, message: string): never {
  throw new DarcyE2eSecretStoreError(code, `[${code}] ${message}`)
}

function assertR1Identity(request: DarcyE2eSecretRequest): void {
  if (request.stackId !== DARCY_E2E_R1_IDENTITY.stackId) {
    fail('IDENTITY_MISMATCH', 'A identidade da stack de segredos não é a R1 autorizada.')
  }
  if (request.volumeId !== DARCY_E2E_R1_IDENTITY.databaseVolume) {
    fail('VOLUME_MISMATCH', 'O volume não corresponde à identidade R1 autorizada.')
  }
}

function assertSecretValue(name: DarcyE2eR1SecretName, value: string | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('SECRET_UNAVAILABLE', `O segredo obrigatório ${name} não está disponível.`)
  }

  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('<') || normalized.endsWith('>') || normalized.includes('synthetic-local-')) {
    fail('SECRET_PLACEHOLDER', `O segredo obrigatório ${name} ainda é um placeholder.`)
  }

  return value
}

/**
 * Resolve os dois segredos sem gerar fallback ou alterar qualquer recurso.
 * O modo resume não aceita segredo novo: o leitor deve fornecer os valores já
 * associados à identidade R1, caso contrário a operação falha fechadamente.
 */
export function resolveDarcyE2eR1Secrets(
  request: DarcyE2eSecretRequest,
  reader: DarcyE2eSecretReader,
): DarcyE2eSecretConfiguration {
  assertR1Identity(request)

  const postgresPassword = assertSecretValue(
    'DARCY_E2E_POSTGRES_PASSWORD',
    reader.read('DARCY_E2E_POSTGRES_PASSWORD', DARCY_E2E_R1_IDENTITY, request.mode),
  )
  const jwtSecret = assertSecretValue(
    'DARCY_E2E_JWT_SECRET',
    reader.read('DARCY_E2E_JWT_SECRET', DARCY_E2E_R1_IDENTITY, request.mode),
  )

  return {
    stackId: DARCY_E2E_R1_IDENTITY.stackId,
    volumeId: DARCY_E2E_R1_IDENTITY.databaseVolume,
    mode: request.mode,
    postgresPassword,
    jwtSecret,
  }
}

/**
 * Valida somente metadados previamente obtidos por um adaptador autorizado.
 * Não acessa filesystem, não segue symlinks e não lê o conteúdo do arquivo.
 */
export function assertProtectedSecretFileMetadata(
  metadata: ProtectedSecretFileMetadata,
  expectedOwnerUid: number,
): void {
  if (!metadata.exists) fail('SECRET_FILE_MISSING', 'O arquivo protegido de segredos não existe.')
  if (metadata.isSymbolicLink) fail('SECRET_FILE_SYMLINK', 'O arquivo protegido de segredos não pode ser um symlink.')
  if (!Number.isInteger(expectedOwnerUid) || metadata.ownerUid !== expectedOwnerUid) {
    fail('SECRET_FILE_OWNER', 'O arquivo protegido de segredos não pertence ao usuário esperado.')
  }
  if ((metadata.mode & 0o077) !== 0) {
    fail('SECRET_FILE_PERMISSIONS', 'O arquivo protegido de segredos possui permissões excessivas.')
  }
}

export function assertNoOperationalMarker(environment: NodeJS.ProcessEnv): void {
  if (environment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED !== undefined) {
    fail('OPERATIONAL_MARKER_FORBIDDEN', 'O provedor de segredos não aceita nem fornece o marcador operacional.')
  }
}
