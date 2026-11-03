# DARCY — Backlog único do ciclo C01

Estados permitidos: `PROPOSTA`, `AUTORIZADA`, `EM ANDAMENTO`, `BLOQUEADA`,
`CONCLUÍDA`, `VALIDADA`.

## C01 — Governança e consolidação dos marcos acadêmicos

Autorização: tarefas locais T1–T6 autorizadas pelo operador. Push, deploy,
migrations remotas, escrita remota, Alpha/produção e IA real permanecem não
autorizados.

| ID | Objetivo | Dependências | Prioridade | Estado |
|---|---|---|---|---|
| C01-T1 | Auditar branches, worktrees, D4.2, testes e guards | nenhuma | alta | CONCLUÍDA |
| C01-T2 | Criar governança, contexto, backlog e decisões canônicos | T1 | alta | CONCLUÍDA |
| C01-T3 | Estabilizar D4.2 no backend | T1 | alta | CONCLUÍDA |
| C01-T4 | Preparar suíte E2E protegida dos comandos D4.2 | T3 | alta | CONCLUÍDA |
| C01-T5 | Integrar comandos no frontend com flag desativada | T3 | alta | CONCLUÍDA |
| C01-T6 | Fechar ciclo, commits locais e proposta C02 | T2–T5 | média | CONCLUÍDA |

## Critérios de aceite

### C01-T1

Baseline real registrado; discrepâncias históricas explicitadas; nenhum acesso
remoto ou descarte de alteração local.

### C01-T2

Quatro documentos mestres criados ou reutilizados, referências consistentes,
sem backlog duplicado, marcados como proposta local pendente de validação humana.

### C01-T3

D4.2 com ownership, revisão, atomicidade, 409/422, idempotência, compatibilidade
legada, testes, TypeScript, Prisma validate e build aprovados.

### C01-T4

Suíte E2E opt-in preparada, com guards de ambiente, cleanup restrito e nenhum
teste remoto executado.

### C01-T5

Frontend usa os comandos somente após autosave confirmado; flag ausente preserva
comportamento anterior; testes, typecheck e build aprovados.

### C01-T6

Commits locais explicitamente stageados, relatório consolidado, proposta
consolidada de publicação por repositório e proposta C02; nenhum push automático.

## Estados independentes de publicação

Os estados abaixo não substituem o estado da tarefa e devem ser registrados
separadamente:

| Escopo | Validação local | Aprovação humana | Publicação GitHub | CI | Validação E2E |
|---|---|---|---|---|---|
| Backend C01 (`48bd69e`, conjunto de 4 commits) | CONCLUÍDA | APROVADA | PUBLICADO | APROVADO — Backend CI #24 | PENDENTE |
| Frontend C01 (`57f185f`, conjunto de 1 commit) | CONCLUÍDA | APROVADA | PUBLICADO | NÃO VERIFICÁVEL | PENDENTE |

Conclusão local, aprovação humana, publicação, CI e E2E são gates distintos.
Nenhum resultado deve ser promovido automaticamente ao estado seguinte.

## Evidências e bloqueios

As evidências detalhadas ficam nos relatórios de cada tarefa. T2 está concluída
como proposta local. T3–T5 estão concluídas localmente; a publicação do C01 foi
realizada após aprovação humana explícita por repositório, branch e conjunto de
commits. A validação E2E permanece pendente.

### Registro de publicação — 01/11/2026

- Backend: `48bd69e02229c89c34a96c8970f7e5a8cb9eb9fc` publicado em
  `origin/desenvolvimento/maturacao-darcy`; Backend CI #24 aprovado.
- Frontend: `57f185fd46d20ccf7c1a6d1c0234098759daa84e` publicado em
  `origin/desenvolvimento/maturacao-darcy`; CI não verificável pelo endpoint
  público consultado.
- Nenhuma migration, E2E remoto, IA real ou deploy foi executado.

O plano autorizado do C02 está registrado em `C02_PROPOSAL.md`; esse documento
é o registro canônico das tarefas C02-T1 a C02-T5 e não há backlog paralelo.

## C03 — Histórico persistente e comparação de versões

O plano canônico está em `C03_PROPOSAL.md`; não foi criado backlog paralelo.

| ID | Objetivo | Estado | Evidência |
|---|---|---|---|
| C03-T1 | Baseline e correção das ressalvas C02 | CONCLUÍDA LOCALMENTE | Observador robusto e teste de autosave sem nova versão |
| C03-T2 | API autenticada de versões | CONCLUÍDA LOCALMENTE | Rotas paginadas, ownership e metadados sem conteúdo |
| C03-T3 | Histórico real no frontend | CONCLUÍDA LOCALMENTE | API e painel opt-in preservando fallback demonstrativo |
| C03-T4 | Comparação visual | CONCLUÍDA LOCALMENTE | Comparação somente leitura com linhas adicionadas/removidas |
| C03-T5 | Validação e governança | CONCLUÍDA LOCALMENTE | 199/73 testes, typechecks, builds e commits locais |

### Gates independentes do C03

| Repositório | Validação local | Aprovação humana | Publicação GitHub | CI | E2E |
|---|---|---|---|---|---|
| Backend | CONCLUÍDA | PENDENTE | NÃO PUBLICADO | PENDENTE | PENDENTE |
| Frontend | CONCLUÍDA | PENDENTE | NÃO PUBLICADO | PENDENTE | PENDENTE |

Falhas de autenticação, ownership, concorrência ou persistência bloqueiam a
publicação de alterações dependentes. A flag do histórico permanece desativada
até aprovação e validação integrada.
