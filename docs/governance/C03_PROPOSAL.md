# DARCY — Proposta do ciclo C03

## Objetivo

Integrar consulta, comparação e restauração segura das versões textuais,
preservando ownership, revisão otimista, histórico imutável e decisões
autorais.

## Tarefas propostas

| ID | Objetivo | Dependências | Critérios principais |
|---|---|---|---|
| C03-T1 | Expor consulta autenticada de eventos e versões | C02-T4 | Ownership, paginação, sem conteúdo indevido |
| C03-T2 | Implementar comparação visual de versões | C03-T1 | Leitura somente; sem substituição automática |
| C03-T3 | Implementar restauração transacional | C03-T1–T2 | `expectedRevision`, nova versão, evento e `409` seguro |
| C03-T4 | Validar integração completa | C03-T1–T3 | Unitários, E2E, concorrência e cleanup |

## Limites

- Nenhuma ativação automática do C03.
- Nenhuma migration ou escrita remota sem autorização específica.
- Nenhuma restauração silenciosa, merge automático ou perda do rascunho local.
- Nenhuma classificação de autoria além da origem operacional comprovável.

## Riscos

- O `HistoryScreen` atual usa dados demonstrativos e requer contrato HTTP novo.
- Textos completos exigem controle rigoroso de ownership e tamanho de resposta.
- Restauração concorrente deve falhar com `409` sem criar efeitos parciais.
