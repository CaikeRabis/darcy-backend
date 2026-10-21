import { describe, expect, it } from 'vitest'
import { resolveEnvironmentFile } from '../../src/config/loadEnvironment'

describe('seleção de perfil de ambiente', () => {
  it('mantém .env como perfil padrão do Alpha', () => {
    expect(resolveEnvironmentFile({})).toBe('.env')
  })

  it('aceita exclusivamente o perfil E2E local previsto', () => {
    expect(resolveEnvironmentFile({ DARCY_ENV_FILE: '.env.e2e.local' })).toBe('.env.e2e.local')
  })

  it('bloqueia caminhos arbitrários de arquivos de ambiente', () => {
    expect(() => resolveEnvironmentFile({ DARCY_ENV_FILE: '../.env' })).toThrow('DARCY_ENV_FILE inválido')
  })
})
