import { describe, expect, it } from 'vitest'
import { parseProfileInput } from '../../src/services/ProfileService'

describe('validação de perfil', () => {
  it('normaliza telefone celular brasileiro sem expor dados adicionais', () => {
    expect(parseProfileInput({ fullName: 'Ana Carolina Ferreira', phone: '(11) 99999-9999' })).toEqual({
      fullName: 'Ana Carolina Ferreira',
      phone: '+5511999999999',
    })
  })

  it('rejeita telefone sem DDD ou nome vazio', () => {
    expect(() => parseProfileInput({ fullName: 'Ana', phone: '99999-9999' })).toThrow()
    expect(() => parseProfileInput({ fullName: '', phone: '' })).toThrow()
  })

  it('não aceita payload sem campos editáveis', () => {
    expect(() => parseProfileInput({})).toThrow('Informe nome completo ou telefone')
  })
})
