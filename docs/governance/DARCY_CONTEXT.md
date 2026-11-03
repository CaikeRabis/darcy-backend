# DARCY — Contexto persistente

## Produto

O DARCY é um sistema de orientação científica que mantém projetos acadêmicos,
progresso do Resumo Acadêmico, decisões autorais, classificação CNPq e
interações assistidas por IA.

## Arquitetura vigente

- Backend: Node.js, TypeScript, Express, Prisma e Supabase Auth/PostgreSQL.
- Frontend: React/TypeScript, autosave serializado e controle otimista de
  concorrência.
- Progresso: `ResumoAcademicoProgress` em JSONB com `revision`.
- Histórico: eventos imutáveis por projeto com `sequence`.
- Versionamento textual: `ResumoAcademicoTextVersion`, com
  `versionNumber`, hash, origem operacional e referências de evento.
- Ambientes: Alpha/produção separados do perfil E2E; guards impedem mistura.

## Estado técnico verificado em 03/11/2026

- Baseline inicial do C03: backend `7971636`, frontend `f3d5c1b` (C02
  publicado); os novos commits C03 permanecem locais.
- Estado publicado anterior ao C03: backend `7971636` e frontend `f3d5c1b`,
  ambos na branch `desenvolvimento/maturacao-darcy`.
- D4.2: implementação local com comandos autenticados de aprovação/consolidação,
  suíte E2E preparada e integração frontend opt-in ainda não publicada.
- Última regressão D4.2: 196 testes backend aprovados, TypeScript, Prisma
  validate, build e `git diff --check`.
- Frontend: integração dos comandos protegida pela flag
  `VITE_RESUMO_MILESTONE_COMMANDS=enabled`; a ausência da flag preserva o fluxo
  anterior e não envia requisições de marco.
- Nenhuma migration, deploy, chamada real de IA ou operação em Alpha/produção
  foi executada no ciclo atual.
- C03-T1/T2/T3/T4 foram implementadas localmente: consulta autenticada de
  histórico/versões, painel opt-in e comparação somente leitura. C03-T3 de
  restauração permanece deliberadamente reservado ao C04.
- Regressão C03: backend 200 testes, frontend 73 testes; TypeScript,
  test-typecheck, builds, Prisma validate (backend), typecheck E2E (frontend)
  e `git diff --check` aprovados.
- C02-T2 e C02-T3 foram executadas exclusivamente no `darcy-e2e`, com projetos
  sintéticos e cleanup confirmado. As escritas remotas ficaram limitadas aos
  recursos sintéticos autorizados; a flag frontend permaneceu local.

## Gates independentes de publicação

- **Validação local:** concluída para os conjuntos de commits do backend e do
  frontend.
- **Aprovação humana:** C01 e C02 já aprovados/publicados; C03 ainda aguarda
  autorização específica por repositório, branch e conjunto de commits.
- **Publicação no GitHub:** C01/C02 permanecem publicados; C03 está somente
  local nos commits `7d09fb9` (backend) e `3727ace` (frontend).
- **Resultado do CI:** C01/C02 preservam os resultados já registrados; não há
  CI remoto para os commits C03 antes do push.
- **Validação E2E:** C03 teve backend aprovado com concorrência `200/409`,
  recuperação `200`, ownership `404`, paginação e cleanup `204/404`. A UI
  alcançou o painel real e a comparação, mas a assertion final de
  `contentVersionRef` do fixture falhou; o gate geral é **GO COM RESSALVA**.

O registro de publicação deve preservar o conjunto de commits, o repositório,
a branch e o resultado do CI; novos pushes continuam exigindo aprovação
explícita.

## Estado do ciclo C02

- C02-T1: concluída, baseline e autorização reconciliados.
- C02-T2: validada com PostgreSQL E2E real e cleanup `204/404`.
- C02-T3: validada com Playwright protegido; comando de aprovação `POST`,
  persistência posterior e cleanup `204/404` confirmados. Uma execução
  posterior, feita apenas para validar a posição de uma assertion, expirou
  aguardando o observador do comando; não foi usada para substituir a evidência
  aprovada.
- C02-T4: concluída como análise; restauração permanece não implementada.
- C02-T5: concluída localmente; commits preparados, sem push automático.

## Estado do ciclo C03

- T1: concluída localmente; observador Playwright robustecido e teste de
  autosave posterior sem nova versão.
- T2: concluída localmente; endpoints GET autenticados, paginados e separados
  entre metadados e conteúdo.
- T3: concluída localmente com flag `VITE_RESUMO_HISTORY_ENABLED` desativada
  por padrão; fluxo demonstrativo existente preservado quando a flag está
  ausente/desativada.
- T4: concluída localmente; comparação de duas versões somente leitura,
  incluindo linhas adicionadas/removidas e textos idênticos.
- T5: concluída localmente; commits rastreáveis e proposta consolidada de
  publicação preparada.
- C03 não está publicado, não está homologado e não autoriza o início de C04.
- A flag de histórico permanece desativada no Alpha; a ressalva visual deve
  ser resolvida antes da habilitação em produção.

## Referências técnicas

- Contrato de histórico: `docs/FASE_4B_1_B_CONTRATO_HISTORICO_RESUMO.md`.
- Estrutura de versões: `docs/FASE_4B_1_D2_ESTRUTURA_VERSOES_TEXTUAIS.md`.
- Serviço de versões: `src/services/ResumoAcademicoTextVersionService.ts`.
- Marcos D4.2: `docs/FASE_4B_1_D4_2_MARCOS_ACADEMICOS.md`.
- Governança e backlog: diretório `docs/governance/`.

## Limitações conhecidas

A proveniência de textos gerados por IA ainda não é comprovável no backend,
portanto geração/regeneração não recebe origem `ia_assistida`. A integração dos
novos comandos no frontend permanece desativada até validação local e posterior
autorização específica.

## Classificação das evidências

- **VERIFICADO NO CÓDIGO/TESTES:** branches, HEADs, contratos D4.2, 200 testes
  backend, 73 testes frontend, typechecks, builds, parser de API, ownership
  nos handlers e guards locais.
- **REPORTADO EM DOCUMENTAÇÃO:** migrations D2 previamente aplicadas no E2E;
  resultados históricos de Playwright e CI.
- **INFERIDO:** compatibilidade operacional dos novos comandos com o backend
  remoto enquanto a integração não for executada no E2E.
- **PENDENTE DE CONFIRMAÇÃO:** ativação da flag no frontend em uma publicação,
  execução E2E específica de C03, revisão humana dos documentos mestres,
  publicação dos commits locais e CI correspondente.

## Retomada e regressões críticas

Cada nova sessão deve comparar este contexto com o backlog, os HEADs e os
worktrees reais antes de retomar tarefas. Divergências entre documentação e
código devem ser registradas e resolvidas pela evidência real.

Falhas de autenticação, ownership, concorrência ou persistência bloqueiam a
publicação de qualquer alteração dependente até correção autorizada ou registro
formal de bloqueio.
