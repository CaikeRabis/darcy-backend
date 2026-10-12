import { vi } from 'vitest'

vi.stubGlobal('fetch', vi.fn(() => {
  throw new Error('Acesso de rede bloqueado nos testes normais.')
}))
