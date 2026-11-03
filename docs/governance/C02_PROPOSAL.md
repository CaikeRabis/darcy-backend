# DARCY — Ciclo C02 autorizado

Estado: `AUTORIZADA` em 03/11/2026, conforme instrução única de ativação.

Estado de execução: T1–T4 concluídas localmente; T5 em consolidação local,
sem push automático.

## Objetivo

Validar a integração dos marcos acadêmicos em ambiente E2E isolado e preparar
uma eventual consolidação posterior, sem ativar Alpha/produção por padrão.

## Tarefas propostas

| ID | Objetivo | Dependências | Limites |
|---|---|---|---|
| C02-T1 | Revisar e aprovar os documentos mestres C01 | C01 concluído | Nenhuma escrita remota |
| C02-T2 | Executar a suíte E2E D4.2 com projeto sintético | C02-T1, guards e backend local | Somente `darcy-e2e`; cleanup restrito |
| C02-T3 | Validar o frontend com a flag em ambiente local/E2E | C02-T2 | Sem IA real; sem Alpha |
| C02-T4 | Avaliar restauração e histórico de versões | C02-T2 | Sem merge automático |
| C02-T5 | Auditar prontidão para publicação | C02-T2–T4 | Sem deploy/push automático |

| Tarefa | Estado | Evidência principal |
|---|---|---|
| C02-T1 | CONCLUÍDA | Baseline real reconciliado; C02 autorizado sem backlog duplicado |
| C02-T2 | VALIDADA | E2E PostgreSQL: aprovação, consolidação, conflitos, ownership e cleanup |
| C02-T3 | VALIDADA | Playwright protegido: flag local, comando POST, persistência e cleanup |
| C02-T4 | CONCLUÍDA | Diagnóstico e plano de histórico/restauração registrados |
| C02-T5 | EM ANDAMENTO | Regressões locais concluídas; consolidação documental pendente |

## Critérios de aceite

- Guards Auth/DB/URL comprovam o mesmo projeto E2E e rejeitam Alpha.
- Aprovação e consolidação produzem evento e versão vinculada.
- Duplo envio resulta em sucesso único e conflito sem duplicação.
- Ownership, rollback, paginação e cleanup são comprovados.
- Frontend preserva rascunho em conflito e só envia comandos após autosave
  confirmado.
- Nenhuma chamada real de IA, migration remota ou operação de produção ocorre
  sem autorização específica.

## Autorizações necessárias

A ativação do C02 autoriza as escritas sintéticas protegidas previstas em C02-T2
e C02-T3, exclusivamente no `darcy-e2e`, após todos os guards obrigatórios.
Migrations, chamadas pagas de IA, push e deploy continuam exigindo autorização
separada. Alpha e produção permanecem fora do escopo.

## Evidências C02

- C02-T2: `result=approved`, aprovação inválida `422`, aprovação `200`, retry
  obsoleto `409`, consolidação concorrente `200/409`, três versões vinculadas,
  ownership `404` e cleanup `204/404`.
- C02-T3: autenticação Playwright aprovada, autosaves confirmados, comando
  `POST /sections/contexto/approve` `200`, GET do estado aprovado, PUT posterior
  `200` e cleanup `204/404`. A flag foi aplicada somente ao processo frontend
  local.
- Nenhuma migration, IA real, Alpha/produção ou deploy foi utilizado.
