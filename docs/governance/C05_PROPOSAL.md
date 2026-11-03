# DARCY — Proposta preliminar do ciclo C05

## Objetivo

Validar em PostgreSQL/Auth E2E a restauração do C04 e preparar eventual
ativação gradual do histórico, sem autorizar Alpha/produção automaticamente.

## Escopo proposto

1. Verificar os guards de identidade E2E e a migration de restauração.
2. Executar, após autorização específica, cenários sintéticos de restauração,
   ownership A/B, 409, idempotência, rollback e cleanup.
3. Homologar visualmente confirmação, cancelamento, sucesso, erro, conflito,
   estado vazio e fluxo legado com a flag desativada.
4. Confirmar que decisões autorais, classificação CNPq e seções não alvo não
   são alteradas.
5. Produzir proposta separada de publicação/ativação, sem executá-la.

## Fora do escopo

Push, deploy, migrations remotas sem autorização, Alpha/produção, IA paga,
restauração automática, merge de versões e início de ciclo posterior.

## Gate

C05 permanece somente como proposta local. Sua execução dependerá de aprovação
humana específica para testes remotos e de parecer técnico após os resultados
offline do C04.
