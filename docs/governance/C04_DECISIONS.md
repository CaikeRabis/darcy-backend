# DARCY — Decisões arquiteturais do ciclo C04

## D-2026-11-03-C04-01 — Evento explícito de restauração

A restauração usa um novo tipo de evento `restauracao`, em vez de reutilizar
eventos de geração ou consolidação. A enumeração é adicionada por migration
aditiva local e permanece não aplicada remotamente.

## D-2026-11-03-C04-02 — Operação idempotente por identidade própria

O cliente envia `operationId`; o servidor deriva `restoration-<operationId>` e
usa essa identidade como `id` do evento e `sourceEventId` da nova versão. A
primeira execução cria o marco. Reenvio do mesmo comando retorna o estado
confirmado sem nova versão; parâmetros divergentes são rejeitados.

## D-2026-11-03-C04-03 — Restauração escopada e não destrutiva

Somente o texto do escopo selecionado é substituído. Uma seção restaurada volta
a `em_revisao`, exigindo nova aprovação para novo marco. Decisões autorais,
classificação CNPq e outras seções não são alteradas.

## D-2026-11-03-C04-04 — Atomicidade e concorrência

Progresso, revisão, evento e nova versão são persistidos na mesma transação
serializável. `expectedRevision` obsoleto gera HTTP 409 sem efeitos parciais;
retries de serialização permanecem limitados ao mecanismo existente.

## D-2026-11-03-C04-05 — Ativação opt-in

O frontend mantém histórico e restauração atrás de
`VITE_RESUMO_HISTORY_ENABLED=enabled`, desativado por padrão. Nenhuma
configuração de Alpha/produção é modificada neste ciclo.

## D-2026-11-03-C04-06 — Gate remoto separado

Os testes locais aprovados não equivalem a validação PostgreSQL/Auth E2E. A
execução remota exige autorização específica, guards comprovados e cleanup
restrito; C05 não é iniciado automaticamente.

## D-2026-11-08-C04-07 — Gate 2 limitado ao E2E sintético

A migration `20261103120000_resumo_academico_restoration_event` e os testes de
restauração foram executados exclusivamente em `darcy-e2e`. O frontend usou a
flag somente no processo local. O sucesso E2E não autoriza ativação em Alpha
ou produção, nem substitui a homologação visual dos estados vazio, erro e
flag desativada.
