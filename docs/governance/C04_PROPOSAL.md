# DARCY — Proposta e registro do ciclo C04

## Objetivo

Estabilizar o histórico acadêmico publicado no ciclo C03 e implementar a
restauração explícita, autenticada e transacional de versões textuais, sem
ativar a funcionalidade em Alpha/produção. A validação remota fica limitada ao
ambiente sintético isolado `darcy-e2e`.

## Escopo e estado local

| ID | Objetivo | Estado local | Evidência |
|---|---|---|---|
| C04-T1 | Estabilizar fixture, observação e estados do histórico | VALIDADA LOCALMENTE | Código C03 auditado; regressões backend/frontend aprovadas |
| C04-T2 | Serviço e comando autenticado de restauração | VALIDADA LOCALMENTE | POST opt-in, ownership, revisão, idempotência e transação |
| C04-T3 | Integração de restauração no frontend | VALIDADA LOCALMENTE | Confirmação explícita, seleção única, hidratação e bloqueios |
| C04-T4 | Testes offline e validação E2E | VALIDADA E2E | PostgreSQL/Auth, frontend local opt-in e cleanup sintético comprovados |
| C04-T5 | Governança e encerramento local | CONCLUÍDA LOCALMENTE | Gate 2 registrado; publicação continua sujeita a autorização separada |

## Contrato de restauração

`POST /api/v1/modulos/resumo-academico/:projectId/versions/:versionId/restore`

Corpo:

```json
{
  "expectedRevision": 4,
  "operationId": "uuid-ou-chave-estavel"
}
```

O backend valida autenticação, ownership, projeto `resumo_academico`, versão
pertencente ao mesmo projeto e revisão esperada. A operação altera somente o
escopo textual da versão: seção restaurada recebe `status: em_revisao`; resumo
completo também atualiza `numero_palavras`. Demais seções, decisões autorais e
classificação CNPq permanecem intactas.

Em uma transação serializável, progresso/revisão, evento `restauracao`, nova
versão `restauracao` e `contentVersionRef` são gravados juntos. A nova versão
usa `previousVersionId` apontando para a versão restaurada. Conflitos retornam
HTTP 409 sem efeitos parciais; versão inexistente retorna 404; entradas
inválidas retornam 400/422.

`operationId` é convertido em identidade estável `restoration-<operationId>`
para o evento e `sourceEventId`. Reenvio idêntico é idempotente; reutilização
da mesma operação com outra versão é rejeitada.

## Flags e segurança

O painel e a ação de restauração permanecem atrás de
`VITE_RESUMO_HISTORY_ENABLED=enabled`; o padrão continua desativado. Nenhuma
configuração Alpha/produção foi alterada. Não houve deploy ou chamadas pagas
de IA. A flag foi habilitada apenas no processo local do frontend ligado ao
`darcy-e2e`, nunca em arquivo de ambiente ou configuração publicada.

Foi criada apenas a migration local aditiva
`20261103120000_resumo_academico_restoration_event`, necessária para o novo
valor enum `restauracao`. Ela foi aplicada exclusivamente ao `darcy-e2e` pelo
launcher protegido, após os guards de Auth/DB/URL; Alpha e produção não foram
acessados.

## Validação local

- Backend: Prisma validate, 204 testes Vitest, test-typecheck, TypeScript,
  build e `git diff --check` aprovados.
- Frontend: 74 testes Vitest, TypeScript, build, typecheck E2E e
  `git diff --check` aprovados.
- Backend E2E: `test:e2e:resumo-restoration` aprovado com criação de duas
  versões, restauração, idempotência, nova restauração, conflito 409,
  ownership 404, preservação de estado e cleanup autenticado.
- Frontend E2E local: `e2e/history/restoration.spec.ts` aprovado (2/2), com
  confirmação/cancelamento, restauração explícita, revisão atualizada, evento
  e versão de origem `restauracao` visíveis no painel e cleanup confirmado.

## Gate E2E realizado

Os guards de Auth/DB/URL confirmaram a identidade `darcy-e2e`, distinta de
Alpha, antes da única migration pendente e de cada execução com escrita. O
status posterior confirmou cinco migrations aplicadas e nenhuma pendência. Os
projetos sintéticos foram excluídos autenticadamente (DELETE 204 seguido de
GET 404); reconciliações posteriores não encontraram marcadores remanescentes.

## Ressalvas e próximos passos

Estados vazio/erro e o fluxo visual com a flag desativada permanecem sem
homologação visual nesta rodada. A proveniência de geração IA continua não
comprovável pelo backend. A funcionalidade continua desativada em
Alpha/produção; C05 não foi iniciado automaticamente.
