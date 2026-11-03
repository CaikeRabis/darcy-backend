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

- Baseline inicial: backend `ed92dc0`, frontend `dd631d5`.
- Estado atual após C01: backend `48bd69e` (conjunto publicado de quatro
  commits), frontend `57f185f` (conjunto publicado de um commit), ambos na
  branch `desenvolvimento/maturacao-darcy`.
- D4.2: implementação local com comandos autenticados de aprovação/consolidação,
  suíte E2E preparada e integração frontend opt-in ainda não publicada.
- Última regressão D4.2: 196 testes backend aprovados, TypeScript, Prisma
  validate, build e `git diff --check`.
- Frontend: integração dos comandos protegida pela flag
  `VITE_RESUMO_MILESTONE_COMMANDS=enabled`; a ausência da flag preserva o fluxo
  anterior e não envia requisições de marco.
- Nenhuma migration, deploy, chamada real de IA ou operação em Alpha/produção
  foi executada no ciclo atual.
- C02-T2 e C02-T3 foram executadas exclusivamente no `darcy-e2e`, com projetos
  sintéticos e cleanup confirmado. As escritas remotas ficaram limitadas aos
  recursos sintéticos autorizados; a flag frontend permaneceu local.

## Gates independentes de publicação

- **Validação local:** concluída para os conjuntos de commits do backend e do
  frontend.
- **Aprovação humana:** concluída para os dois repositórios.
- **Publicação no GitHub:** C01 permanece publicado; os commits C02 estão
  apenas locais e aguardam aprovação humana específica para push.
- **Resultado do CI:** Backend CI #24 aprovado para `48bd69e`; não há CI remoto
  disponível para os commits C02 ainda não publicados.
- **Validação E2E:** concluída para C02-T2 e para uma execução aprovada de
  C02-T3; uma reexecução posterior de observabilidade expirou no observador
  do Playwright após o backend registrar o POST 200, sem nova tentativa.

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

- **VERIFICADO NO CÓDIGO/TESTES:** branches, HEADs, contratos D4.2, 196 testes
  backend, 71 testes frontend, typechecks, builds e guards locais.
- **REPORTADO EM DOCUMENTAÇÃO:** migrations D2 previamente aplicadas no E2E;
  resultados históricos de Playwright e CI.
- **INFERIDO:** compatibilidade operacional dos novos comandos com o backend
  remoto enquanto a integração não for executada no E2E.
- **PENDENTE DE CONFIRMAÇÃO:** ativação da flag no frontend em uma publicação,
  revisão humana dos documentos mestres e publicação dos commits locais.

## Retomada e regressões críticas

Cada nova sessão deve comparar este contexto com o backlog, os HEADs e os
worktrees reais antes de retomar tarefas. Divergências entre documentação e
código devem ser registradas e resolvidas pela evidência real.

Falhas de autenticação, ownership, concorrência ou persistência bloqueiam a
publicação de qualquer alteração dependente até correção autorizada ou registro
formal de bloqueio.
