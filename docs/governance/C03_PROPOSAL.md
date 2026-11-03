# DARCY — Proposta e registro do ciclo C03

## Objetivo

Integrar consulta, comparação e restauração segura das versões textuais,
preservando ownership, revisão otimista, histórico imutável e decisões
autorais.

## Tarefas propostas

| ID | Objetivo | Dependências | Critérios principais | Estado local |
|---|---|---|---|---|
| C03-T1 | Baseline e correção das ressalvas C02 | C02 | Observador robusto e teste de autosave sem nova versão | CONCLUÍDA LOCALMENTE |
| C03-T2 | API autenticada de versões | C03-T1 | Ownership, paginação e metadados sem conteúdo indevido | CONCLUÍDA LOCALMENTE |
| C03-T3 | Histórico real no frontend | C03-T2 | API real opt-in, estados de carregamento/vazio/erro | CONCLUÍDA LOCALMENTE |
| C03-T4 | Comparação visual | C03-T3 | Duas versões, diferenças acessíveis e somente leitura | CONCLUÍDA LOCALMENTE |
| C03-T5 | Validação, governança e encerramento | C03-T1–T4 | Regressões, E2E pendente, commits e proposta de publicação | CONCLUÍDA LOCALMENTE |

## Limites

- Nenhuma ativação automática do C03.
- Nenhuma migration ou escrita remota sem autorização específica.
- Nenhuma restauração silenciosa, merge automático ou perda do rascunho local.
- Nenhuma classificação de autoria além da origem operacional comprovável.
- A tela real permanece protegida por `VITE_RESUMO_HISTORY_ENABLED=enabled`; o
  valor recomendado no exemplo é `disabled`.
- A comparação busca metadados sem conteúdo integral e só consulta o conteúdo
  das duas versões selecionadas.

## Riscos

- O `HistoryScreen` atual usa dados demonstrativos e requer contrato HTTP novo.
- Textos completos exigem controle rigoroso de ownership e tamanho de resposta.
- Restauração concorrente deve falhar com `409` sem criar efeitos parciais.

## Evidências locais do C03

- Backend: `npm test` aprovou 200 testes; TypeScript, test-typecheck, Prisma
  validate, build e `git diff --check` aprovados.
- Frontend: `npm test` aprovou 73 testes; TypeScript, test-typecheck, build,
  typecheck E2E e `git diff --check` aprovados.
- C03-T1: o observador do comando de aprovação foi alterado para capturar a
  resposta sem depender de um `waitForResponse` iniciado após a requisição.
  O teste local de marcos também comprova que PUT genérico posterior a uma
  aprovação não cria nova versão.
- C03-T2: `GET /:projectId/versions` retorna somente metadados, com `scopeKey`,
  limite e cursor por `versionNumber`; `GET /:projectId/versions/:versionId`
  retorna conteúdo integral somente após ownership autenticado. Recursos
  ausentes ou de outro projeto resultam em 404 sanitizado.
- A consulta paginada usa uma seleção Prisma de metadados sem `content`; o
  conteúdo integral só é selecionado no detalhe autenticado.
- C03-T3/T4: `HistoryScreen` usa a API real apenas para projetos
  `resumo-academico` quando a flag opt-in está habilitada; a comparação é
  somente leitura, sem restauração ou merge.

## Gates e publicação

| Repositório | Branch | Validação local | Aprovação humana | Publicação GitHub | CI | Validação E2E |
|---|---|---|---|---|---|---|
| Backend | `desenvolvimento/maturacao-darcy` | CONCLUÍDA | APROVADA | PUBLICADO (`ae9801a`) | APROVADO — Backend CI #41651698301 | GO COM RESSALVA |
| Frontend | `desenvolvimento/maturacao-darcy` | CONCLUÍDA | APROVADA | PUBLICADO (`3727ace`) | APROVADO — Frontend CI #41651696497 | GO COM RESSALVA |

Commits publicados:

- Backend `7d09fb97be09d6684771d06d6a3525fdf7ed3363`, `f6dce45958ff37190e8ca8fc2970dabcc49478d0`,
  `d2f0d508b1aa3d3a9a918bed0cdf4721e1a3c4d6` e
  `ae9801a6279e67d0986006d870035ece503a5cd8`.
- Frontend `3727aceab8494932eaeab6704ff00d3e44711491`.

O conjunto autorizado foi enviado exclusivamente para
`origin/desenvolvimento/maturacao-darcy`. Não houve migration, escrita remota,
deploy ou chamada paga de IA no C03.

### Registro de publicação

- Backend: HEAD remoto `ae9801a6279e67d0986006d870035ece503a5cd8`; Backend CI
  #41651698301 concluído com sucesso.
- Frontend: HEAD remoto `3727aceab8494932eaeab6704ff00d3e44711491`; Frontend CI
  #41651696497 concluído com sucesso.
- Os worktrees locais estão sincronizados com os respectivos remotos. As
  atualizações documentais desta consolidação permanecem locais e não foram
  incluídas em novo push.

## Gate E2E complementar

- Backend `test:e2e:resumo-history`: **APROVADO**, exit code 0. Evidências:
  `initialEventCount=6`, `finalEventCount=8`, sequências 1–8, concorrência
  `200/409`, recuperação `200`, ownership `404`, paginação `2/2` e cleanup
  `204/404`.
- Frontend Playwright com flag temporariamente habilitada: o painel real foi
  carregado, a listagem não exibiu conteúdo integral e a comparação exibiu as
  duas versões sintéticas. A execução terminou em falha somente na assertion
  do fixture que esperava `contentVersionRef` em eventos criados diretamente
  sem esse vínculo; não há defeito funcional confirmado. Cada projeto criado
  foi limpo com `DELETE 204` e verificação `GET 404`.
- Estados vazio/erro e fluxo legado com flag desativada permanecem cobertos
  por código/testes locais, mas não foram homologados visualmente neste gate.

### Parecer do gate

**GO COM RESSALVA** para publicação dos commits com a flag desativada. A
ressalva é a correção/estabilização do fixture e da assertion visual de vínculo
evento-versão antes de habilitar o histórico real no Alpha.

## Pendências E2E

Antes de publicar ou habilitar a flag no Alpha, executar sob autorização
específica, somente no ambiente E2E protegido:

1. validar listagem/detalhe com ownership A/B e paginação real;
2. confirmar que o conteúdo integral não aparece na listagem;
3. validar a tela com flag habilitada, comparação de textos longos e estados
   de carregamento, vazio e erro;
4. registrar uma asserção remota de que PUT genérico posterior à aprovação
   não aumenta a quantidade de versões.

Essas pendências não foram mascaradas por testes locais.

## Proposta do ciclo C04

Implementar restauração explícita e autenticada, com confirmação visual,
`expectedRevision`, nova versão de origem `restauracao`, evento de histórico,
linhagem `parentVersionId`, bloqueio seguro em `409` e validação PostgreSQL E2E.
Não iniciar C04 automaticamente.

## Situação pós-publicação

A publicação foi autorizada e concluída na branch de desenvolvimento com
parecer **GO COM RESSALVA**. A flag do histórico permanece desativada por
padrão e a funcionalidade não está autorizada para ativação em Alpha ou
produção. O C04 não foi iniciado.
