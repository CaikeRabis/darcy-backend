# DARCY — Proposta do ciclo C02

## Objetivo

Validar a integração dos marcos acadêmicos em ambiente E2E isolado e preparar
uma eventual consolidação posterior, sem ativar Alpha/produção por padrão.

## Tarefas propostas

| ID | Objetivo | Dependências | Limites |
|---|---|---|---|
| C02-T1 | Revisar e aprovar os documentos mestres C01 | C01 concluído | Nenhuma escrita remota |
| C02-T2 | Executar a suíte E2E D4.2 com projeto sintético | Autorização específica, guards e backend local | Somente `darcy-e2e`; cleanup restrito |
| C02-T3 | Validar o frontend com a flag em ambiente local/E2E | C02-T2 | Sem IA real; sem Alpha |
| C02-T4 | Avaliar restauração e histórico de versões | C02-T2 | Sem merge automático |
| C02-T5 | Auditar prontidão para publicação | C02-T2–T4 | Sem deploy/push automático |

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

Cada execução remota, escrita no E2E, migration, chamada paga de IA, push ou
deploy deverá ser autorizada separadamente. A aprovação desta proposta não
autoriza nenhuma dessas operações.
