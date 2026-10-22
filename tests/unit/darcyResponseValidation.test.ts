import { describe, expect, it } from 'vitest'

import { validateExperimentDarcyResponse } from '../../src/services/ai/darcyResponseValidation'

describe('validação local da resposta experimental DARCY', () => {
  it('aceita JSON que satisfaz o contrato real de resposta', () => {
    expect(validateExperimentDarcyResponse(JSON.stringify({
      mensagem: 'Orientação sintética.',
      cards: [{
        id: 'card-1', tipo: 'reflexao', titulo: 'Título', conteudo: 'Conteúdo', prioridade: 'media',
      }],
      diagnostico: {
        clareza: 80, coerencia: 75, completude: 70, pontosFortes: ['Clareza'], pontosAMelhorar: ['Delimitação'],
      },
      perguntasEstrategicas: ['Qual é o recorte?'],
      sugestoesReferencias: ['Referência sintética'],
      opcoesDinamicas: { recorte: ['Local', 'Nacional'] },
    }))).toEqual({ ok: true })
  })

  it('recusa JSON sintaticamente inválido', () => {
    expect(validateExperimentDarcyResponse('{')).toEqual({ ok: false, reason: 'invalid_json' })
  })

  it.each([
    ['sem mensagem', {}],
    ['com mensagem em tipo incompatível', { mensagem: 42 }],
    ['com campo não previsto', { mensagem: 'ok', extra: true }],
    ['com diagnóstico incompleto', { mensagem: 'ok', diagnostico: { clareza: 10 } }],
  ])('recusa resposta %s', (_label, response) => {
    expect(validateExperimentDarcyResponse(JSON.stringify(response))).toEqual({ ok: false, reason: 'invalid_contract' })
  })
})
