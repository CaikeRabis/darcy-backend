# C02-T4 — Histórico, comparação e restauração

## Escopo e evidências

Auditoria realizada em 03/11/2026, sem alteração funcional, banco remoto ou
execução de IA.

- Backend: `ResumoAcademicoController.getHistory`,
  `listOwnedResumoAcademicoHistory` e `ResumoAcademicoTextVersionService`.
- Frontend: `HistoryScreen`, tipos `HistoryEvent` e camada `darcyApi`.
- A validação E2E C02-T2 comprovou eventos e versões vinculadas para marcos
  explícitos; C02-T3 comprovou o comando de aprovação atrás da flag local.

## Estado atual

### Histórico de eventos

O backend possui `GET /api/v1/modulos/resumo-academico/:projectId/history`,
protegido por autenticação e ownership. A paginação usa `beforeSequence` e a
sequência exclusiva por projeto como cursor estável. O retorno contém tipo,
ator, seção, resumo, data e `contentVersionRef`, mas não inclui o texto integral.

### Versões textuais

`ResumoAcademicoTextVersionService` já oferece consulta de versão individual e
listagem por projeto/escopo, com ownership, limite de página e cursor por
`versionNumber`. A camada ainda não possui rotas públicas correspondentes.

### Frontend

`HistoryScreen` renderiza `MOCK_HISTORY` e os tipos atuais (`HistoryEvent`,
`ChangeType`, `ChangeAuthor`) não correspondem integralmente ao contrato do
backend. Não existe consulta autenticada de versões, comparação ou restauração.

## Contrato mínimo recomendado para C03

1. `GET /api/v1/modulos/resumo-academico/:projectId/versions` com `scopeKey`,
   `limit` e `beforeVersionNumber`, retornando metadados e cursor.
2. `GET /api/v1/modulos/resumo-academico/:projectId/versions/:versionId`,
   retornando o texto somente após ownership.
3. A resposta deve distinguir evento, revisão do progresso, número da versão,
   origem operacional e linhagem, sem expor prompts ou credenciais.
4. Comparação deve ser uma operação de leitura; nunca substituir o progresso
   atual automaticamente.

## Restauração segura

A restauração deve ser um comando autenticado posterior, condicionado a
`expectedRevision` confirmado. Ela deve:

- criar uma nova versão com `origin = RESTAURACAO`;
- preservar a versão de origem e todas as versões anteriores;
- registrar evento próprio com `parentVersionId` e `contentVersionRef`;
- atualizar progresso, revisão, evento e versão na mesma transação;
- retornar `409` sem efeitos colaterais quando a revisão estiver obsoleta;
- exigir confirmação explícita no frontend, sem merge automático.

## Riscos e testes necessários

- Não converter o `actor` histórico em autoria intelectual sem evidência.
- Não confundir `sequence`, `revision` e `versionNumber`.
- Garantir que textos completos só sejam retornados ao proprietário.
- Testar paginação, comparação, ownership, conflito concorrente, restauração
  idempotente e preservação das versões anteriores.
- Substituir o mock do `HistoryScreen` somente após contrato HTTP e testes
  autenticados estarem consolidados.

## Backlog proposto para C03

- C03-T1: rotas autenticadas de consulta de versões e integração do histórico.
- C03-T2: componentes de comparação visual sem substituição automática.
- C03-T3: comando transacional de restauração com `expectedRevision`.
- C03-T4: testes E2E de ownership, conflitos e linhagem.
