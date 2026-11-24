import { describe, expect, it } from 'vitest'
import {
  assertDarcyE2eR1AuthHealthResponse,
  collectDarcyE2eR1OperationalEvidence,
  type DarcyE2eR1StackVerifierDependencies,
} from '../../src/config/darcyE2eR1StackVerifier'
import {
  assertDarcyE2eR1OperationalStack,
  createDarcyE2eR1OperationalEnvironment,
  DARCY_E2E_R1_STACK,
} from '../../src/config/darcyE2eR1StackLauncher'
import { DARCY_E2E_STACK_IMAGES, type OperationalStackSnapshot } from '../../src/config/darcyE2eStackLauncher'
import { createIsolatedPrismaE2EEnvironment, getPrismaE2ECommand } from '../../src/config/prismaE2eEnvironment'
import { getScientificDiagnosisProviderMode } from '../../src/config/scientificDiagnosisProvider'

const manifestPath = '/repo/infra/darcy-e2e-c0361-r1/docker-compose.yml'
const daemon = { context: 'desktop-linux', host: 'unix:///Users/test/.docker/run/docker.sock', local: true }

function container(service: 'db' | 'auth' | 'gateway', overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const image = service === 'db'
    ? DARCY_E2E_STACK_IMAGES.database
    : service === 'auth' ? DARCY_E2E_STACK_IMAGES.auth : DARCY_E2E_STACK_IMAGES.gateway
  const ports = service === 'db'
    ? { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55522' }] }
    : service === 'gateway'
      ? { '8000/tcp': [{ HostIp: '127.0.0.1', HostPort: '55521' }] }
      : {}
  return {
    Id: `${service}-id`,
    Name: `/darcy-e2e-c0361-r1-${service}-1`,
    Config: {
      Image: image,
      Labels: {
        'com.docker.compose.project': DARCY_E2E_R1_STACK.composeProject,
        'com.docker.compose.service': service,
      },
    },
    State: { Running: true, Health: service === 'db' ? { Status: 'healthy' } : undefined },
    NetworkSettings: {
      Networks: { [DARCY_E2E_R1_STACK.network]: {} },
      Ports: ports,
    },
    Mounts: service === 'db' ? [{ Name: DARCY_E2E_R1_STACK.databaseVolume }] : [],
    ...overrides,
  }
}

function dockerFixture(overrides: {
  context?: string
  host?: string
  networkName?: string
  networkProject?: string
  volumeName?: string
  volumeProject?: string
  containers?: Record<string, unknown>[]
  authHealthy?: boolean
  networkMembers?: Record<string, unknown>
  throwOn?: string
} = {}): { dependencies: DarcyE2eR1StackVerifierDependencies; calls: string[][] } {
  const calls: string[][] = []
  const values = {
    context: 'desktop-linux',
    host: 'unix:///Users/test/.docker/run/docker.sock',
    networkName: DARCY_E2E_R1_STACK.network,
    networkProject: DARCY_E2E_R1_STACK.composeProject,
    volumeName: DARCY_E2E_R1_STACK.databaseVolume,
    volumeProject: DARCY_E2E_R1_STACK.composeProject,
    containers: [container('db'), container('auth'), container('gateway')],
    authHealthy: true,
    ...overrides,
  }
  const byId = new Map(values.containers.map((item) => [String(item.Id), item]))
  const networkMembers = values.networkMembers ?? Object.fromEntries(values.containers.map((item) => [
    String(item.Id), { Name: String(item.Name).replace(/^\//, '') },
  ]))
  const runDocker = (args: readonly string[]): string => {
    calls.push([...args])
    const key = args.join(' ')
    if (values.throwOn && key.includes(values.throwOn)) throw new Error('password=do-not-leak')
    if (key === 'context show') return values.context
    if (key.startsWith('context inspect')) return values.host
    if (key.startsWith('info ')) return JSON.stringify({ Name: 'docker-desktop' })
    if (key.startsWith('network inspect')) return JSON.stringify([{ Name: values.networkName, Labels: { 'com.docker.compose.project': values.networkProject }, Containers: networkMembers }])
    if (key.startsWith('volume inspect')) return JSON.stringify([{ Name: values.volumeName, Labels: { 'com.docker.compose.project': values.volumeProject } }])
    if (key.startsWith('ps -aq')) return values.containers.map((item) => item.Id).join('\n')
    if (key.startsWith('inspect ')) return JSON.stringify([byId.get(args[1])])
    throw new Error(`unexpected docker command: ${key}`)
  }
  return {
    calls,
    dependencies: {
      runDocker,
      probeAuthHealth: () => values.authHealthy
        ? { status: 200, contentType: 'application/json; charset=utf-8', body: { version: 'v2.0.0', name: 'GoTrue', description: 'Auth API' } }
        : { status: 503, contentType: 'application/json', body: { version: '', name: 'GoTrue', description: 'Auth API' } },
      manifestPath,
      now: () => '2026-11-23T00:00:00.000Z',
    },
  }
}

function localProfile(): Record<string, string> {
  return {
    DARCY_E2E_GUARD: 'enabled',
    DARCY_E2E_LOCAL_STACK_ID: DARCY_E2E_R1_STACK.stackId,
    DARCY_E2E_LOCAL_GATEWAY_PORT: '55521',
    DARCY_E2E_LOCAL_DATABASE_PORT: '55522',
    DARCY_E2E_LOCAL_DIRECT_PORT: '55522',
    DARCY_ALPHA_SUPABASE_PROJECT_REF: 'alphaproject1',
    DATABASE_URL: 'postgresql://postgres:password@127.0.0.1:55522/postgres',
    DIRECT_URL: 'postgresql://postgres:password@127.0.0.1:55522/postgres',
    SUPABASE_URL: 'http://127.0.0.1:55521',
    SUPABASE_PUBLISHABLE_KEY: 'synthetic-key',
  }
}

function operationalSnapshot(): OperationalStackSnapshot {
  const result = dockerFixture().dependencies
  const evidence = collectDarcyE2eR1OperationalEvidence(result)
  return evidence.snapshot
}

describe('verificador operacional da stack E2E R1', () => {
  it('R01 aceita identidade R1 coletada diretamente', () => {
    const { dependencies } = dockerFixture()
    const evidence = collectDarcyE2eR1OperationalEvidence(dependencies)
    expect(evidence.source).toBe('docker')
    expect(evidence.snapshot.manifest.composeProject).toBe(DARCY_E2E_R1_STACK.composeProject)
  })

  it.each([
    ['R02 projeto antigo', { networkProject: 'darcy-e2e-c0361' }],
    ['R03 stack genérica', { networkProject: 'supabase' }],
  ])('%s rejeita identidade divergente', (_name, overrides) => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture(overrides).dependencies)).toThrow()
  })

  it('R04 rejeita volume original', () => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ volumeName: 'darcy-e2e-c0361_db' }).dependencies)).toThrow()
  })

  it('R05 rejeita volume desconhecido', () => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ volumeName: 'unknown_db' }).dependencies)).toThrow()
  })

  it('R06 rejeita rede divergente', () => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ networkName: 'shared_network' }).dependencies)).toThrow()
  })

  it('R07 rejeita porta divergente', () => {
    const db = container('db', { NetworkSettings: { Networks: { [DARCY_E2E_R1_STACK.network]: {} }, Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55523' }] } } })
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ containers: [db, container('auth'), container('gateway')] }).dependencies)).toThrow()
  })

  it('R08 rejeita bind público', () => {
    const gateway = container('gateway', { NetworkSettings: { Networks: { [DARCY_E2E_R1_STACK.network]: {} }, Ports: { '8000/tcp': [{ HostIp: '0.0.0.0', HostPort: '55521' }] } } })
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ containers: [container('db'), container('auth'), gateway] }).dependencies)).toThrow()
  })

  it('R09 rejeita imagem não autorizada', () => {
    const db = container('db', { Config: { Image: 'postgres:latest', Labels: { 'com.docker.compose.project': DARCY_E2E_R1_STACK.composeProject, 'com.docker.compose.service': 'db' } } })
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ containers: [db, container('auth'), container('gateway')] }).dependencies)).toThrow()
  })

  it('R10 rejeita container sem label correta', () => {
    const auth = container('auth', { Config: { Image: DARCY_E2E_STACK_IMAGES.auth, Labels: {} } })
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ containers: [container('db'), auth, container('gateway')] }).dependencies)).toThrow()
  })

  it('R11 rejeita serviço ausente', () => {
    const worker = container('auth', { Config: { Image: DARCY_E2E_STACK_IMAGES.auth, Labels: { 'com.docker.compose.project': DARCY_E2E_R1_STACK.composeProject, 'com.docker.compose.service': 'worker' } } })
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ containers: [container('db'), worker, container('gateway')] }).dependencies)).toThrow()
  })

  it('R12 rejeita daemon remoto', () => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ context: 'remote', host: 'tcp://remote:2375' }).dependencies)).toThrow()
  })

  it('R13 rejeita Auth indisponível pelo gateway', () => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ authHealthy: false }).dependencies)).toThrow()
  })

  it('R14 rejeita GoTrue apenas running sem health funcional', () => {
    expect(() => collectDarcyE2eR1OperationalEvidence(dockerFixture({ authHealthy: false }).dependencies)).toThrow()
  })

  it('R15 snapshot simulado não emite marcador', () => {
    const environment = createDarcyE2eR1OperationalEnvironment({}, operationalSnapshot())
    expect(environment.DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED).toBeUndefined()
  })

  it('R16 validador puro não emite marcador para snapshot simulado', () => {
    expect(() => assertDarcyE2eR1OperationalStack({ ...operationalSnapshot(), containers: [] })).toThrow()
    const environment = createDarcyE2eR1OperationalEnvironment({}, operationalSnapshot())
    expect(environment).not.toHaveProperty('DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED')
  })

  it('R17 evidência estrutural não concede autorização operacional', () => {
    const source = { source: 'docker', snapshot: operationalSnapshot() }
    const environment = createDarcyE2eR1OperationalEnvironment({}, source.snapshot)
    expect(environment).not.toHaveProperty('DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED')
  })

  it('R18 guard Prisma continua exigindo prova operacional', () => {
    expect(() => createIsolatedPrismaE2EEnvironment(localProfile())).toThrow('comprovação operacional')
  })

  it('R19 deploy sem autorização explícita é rejeitado', () => {
    expect(() => getPrismaE2ECommand(['migrate', 'deploy'], undefined)).toThrow('DARCY_E2E_MIGRATION_APPROVED=apply')
  })

  it('R20 autorização de migration sem evidência operacional continua rejeitada', () => {
    expect(getPrismaE2ECommand(['migrate', 'deploy'], 'apply')).toEqual(['migrate', 'deploy'])
    expect(() => createIsolatedPrismaE2EEnvironment(localProfile(), { PATH: '/usr/bin' })).toThrow('comprovação operacional')
  })

  it('R21 provider científico real não é selecionado quando fake é exigido', () => {
    expect(getScientificDiagnosisProviderMode({ DARCY_SCIENTIFIC_DIAGNOSIS_PROVIDER: 'fake' })).toBe('fake')
  })

  it('R22 falhas do Docker não vazam mensagens sensíveis', () => {
    const { dependencies } = dockerFixture({ throwOn: 'network inspect' })
    expect(() => collectDarcyE2eR1OperationalEvidence(dependencies)).toThrow('evidência operacional')
    try { collectDarcyE2eR1OperationalEvidence(dependencies) } catch (error) {
      expect(String(error)).not.toContain('do-not-leak')
    }
  })

  it('R23 somente comandos Docker de leitura são usados', () => {
    const { dependencies, calls } = dockerFixture()
    collectDarcyE2eR1OperationalEvidence(dependencies)
    expect(calls.some((call) => /(^| )(create|start|stop|rm|down|up|prune|exec)( |$)/.test(call.join(' ')))).toBe(false)
  })

  it('R24 verificador antigo permanece separado da identidade R1', () => {
    expect(DARCY_E2E_R1_STACK.hostPorts).toEqual({ gateway: 55521, database: 55522 })
    expect(DARCY_E2E_R1_STACK.composeProject).not.toBe('darcy-e2e-c0361')
  })

  it('R25 evidência marcada como teste não autoriza operação', () => {
    const environment = createDarcyE2eR1OperationalEnvironment({}, operationalSnapshot())
    expect(environment).not.toHaveProperty('DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED')
  })

  it('valida a identidade estrita mesmo com um snapshot estruturalmente completo', () => {
    expect(() => assertDarcyE2eR1OperationalStack(operationalSnapshot())).not.toThrow()
  })

  it.each([
    ['H01 resposta GoTrue válida', { status: 200, contentType: 'application/json', body: { version: 'v2', name: 'GoTrue', description: 'Auth' } }],
    ['H02 HTTP 500', { status: 500, contentType: 'application/json', body: { version: 'v2', name: 'GoTrue', description: 'Auth' } }],
    ['H03 HTML', { status: 200, contentType: 'text/html', body: { version: 'v2', name: 'GoTrue', description: 'Auth' } }],
    ['H04 JSON inválido', { status: 200, contentType: 'application/json', body: null }],
    ['H05 estrutura inesperada', { status: 200, contentType: 'application/json', body: { ok: true } }],
    ['H06 redirecionamento', { status: 200, contentType: 'application/json', redirected: true, body: { version: 'v2', name: 'GoTrue', description: 'Auth' } }],
  ])('%s é rejeitado quando incompatível', (_name, response) => {
    const body = response.body
    const isValid = response.status === 200 &&
      response.contentType === 'application/json' &&
      !('redirected' in response && response.redirected) &&
      Boolean(body && typeof body === 'object' && !Array.isArray(body) && 'version' in body)
    if (isValid) {
      expect(() => assertDarcyE2eR1AuthHealthResponse('http://127.0.0.1:55521/auth/v1/health', response)).not.toThrow()
    } else {
      expect(() => assertDarcyE2eR1AuthHealthResponse('http://127.0.0.1:55521/auth/v1/health', response)).toThrow()
    }
  })

  it('H07/H08 rejeita URL divergente e corpo ausente', () => {
    const valid = { status: 200, contentType: 'application/json', body: { version: 'v2', name: 'GoTrue', description: 'Auth' } }
    expect(() => assertDarcyE2eR1AuthHealthResponse('http://localhost:55521/auth/v1/health', valid)).toThrow()
    expect(() => assertDarcyE2eR1AuthHealthResponse('http://127.0.0.1:55521/auth/v1/health', { ...valid, body: null })).toThrow()
  })

  it('N01/N02 rejeita membro externo da rede R1', () => {
    const { dependencies } = dockerFixture({ networkMembers: {
      'db-id': { Name: 'darcy-e2e-c0361-r1-db-1' },
      'auth-id': { Name: 'darcy-e2e-c0361-r1-auth-1' },
      'gateway-id': { Name: 'darcy-e2e-c0361-r1-gateway-1' },
      'external-id': { Name: 'other-stack-worker-1' },
    } })
    expect(() => collectDarcyE2eR1OperationalEvidence(dependencies)).toThrow()
  })

  it('N03/N04/N08 rejeita associação de rede ausente ou contraditória', () => {
    const missing = dockerFixture({ networkMembers: {} }).dependencies
    expect(() => collectDarcyE2eR1OperationalEvidence(missing)).toThrow()
    const contradictory = dockerFixture({ networkMembers: {
      'db-id': { Name: 'wrong-name' },
      'auth-id': { Name: 'darcy-e2e-c0361-r1-auth-1' },
      'gateway-id': { Name: 'darcy-e2e-c0361-r1-gateway-1' },
    } }).dependencies
    expect(() => collectDarcyE2eR1OperationalEvidence(contradictory)).toThrow()
  })
})
