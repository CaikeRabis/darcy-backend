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

- Backend: `npm test` aprovou 199 testes; TypeScript, test-typecheck, Prisma
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
- C03-T3/T4: `HistoryScreen` usa a API real apenas para projetos
  `resumo-academico` quando a flag opt-in está habilitada; a comparação é
  somente leitura, sem restauração ou merge.

## Gates e commits locais

| Repositório | Branch | Validação local | Aprovação humana | Publicação GitHub | CI | Validação E2E |
|---|---|---|---|---|---|---|
| Backend | `desenvolvimento/maturacao-darcy` | CONCLUÍDA | PENDENTE | NÃO PUBLICADO | NÃO VERIFICADO PARA C03 | PENDENTE |
| Frontend | `desenvolvimento/maturacao-darcy` | CONCLUÍDA | PENDENTE | NÃO PUBLICADO | NÃO VERIFICADO PARA C03 | PENDENTE |

Commits locais preparados:

- Backend `7d09fb9` — `feat(history): expõe consulta autenticada de versões`.
- Frontend `3727ace` — `feat(history): integra historico persistente no frontend`.
- Governança C03: commit documental local contendo exclusivamente os quatro
  documentos canônicos atualizados.

Nenhum destes commits foi enviado ao GitHub. Não houve migration, escrita
remota, deploy ou chamada paga de IA no C03.

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

## Pedido de publicação

Solicita-se aprovação humana posterior, separada por repositório, branch e
conjunto exato de commits acima. Até essa aprovação, o estado correto é
**validado localmente, não publicado e não homologado**.
