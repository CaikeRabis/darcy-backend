# Task 4B.1-D4.2 — Marcos acadêmicos transacionais

## Escopo

O PUT de progresso continua sendo o caminho de autosave. Ele não cria
snapshots textuais. Os comandos abaixo são autenticados, exigem
`expectedRevision` e só devem ser chamados por uma integração de frontend
explicitamente habilitada em etapa posterior.

## Comandos

### Aprovação de seção

`POST /api/v1/modulos/resumo-academico/:projectId/sections/:section/approve`

Body:

```json
{
  "progress": "<estado validado do resumo>",
  "expectedRevision": 3
}
```

`section` é um valor oficial de `ResumoAcademicoSection`. O servidor exige que
a seção esteja com status `aprovado` e possua `texto_sugerido` não vazio. Para
um projeto já existente, o comando só pode alterar o status da seção; o texto
deve ter sido persistido previamente pelo autosave.

### Consolidação

`POST /api/v1/modulos/resumo-academico/:projectId/consolidate`

Usa o mesmo body e exige `resumo_completo` não vazio já persistido. Em um
projeto existente, o snapshot enviado deve corresponder ao progresso persistido;
o comando não é um segundo autosave. A operação confirma um marco pesquisador;
ela não certifica autoria exclusiva nem registra geração de IA.

## Atomicidade

Cada comando valida ownership e revisão dentro de uma transação serializável.
O progresso é atualizado, o evento é criado, a versão é criada pelo serviço
`createResumoAcademicoTextVersionInTransaction` e o evento recebe
`contentVersionRef`. Qualquer falha reverte os três registros. Um conflito de
revisão retorna HTTP 409 sem criar evento ou versão.

As contagens permanecem independentes:

- `revision`: revisão otimista do progresso;
- `sequence`: ordem do histórico;
- `versionNumber`: ordem dos snapshots dentro de um `scopeKey`.

## Escopos e origem

- Seções: `secao.contexto`, `secao.objetivo`, `secao.metodologia`,
  `secao.fundamentacao_teorica` e `secao.resultados`.
- Resumo final: `resumo_completo`.
- Origem dos marcos: `pesquisador`/`researcher_confirmation`.

Geração e regeneração de IA permanecem sem versionamento nesta etapa, pois o
backend ainda não recebe uma prova verificável de proveniência. Autosaves,
digitação, classificação CNPq e decisões autorais isoladas também não criam
versões.

## Idempotência

`sourceEventId` é a chave de retry. Repetições da mesma operação retornam a
versão existente. Confirmações semânticas diferentes podem gerar versões com o
mesmo hash, preservando marcos de aprovação distintos. A deduplicação por hash
continua válida para operações não semânticas.

Projetos legados não recebem snapshots retroativos. Primeiro deve ser salvo um
texto pelo autosave; somente depois uma aprovação ou consolidação explícita
cria a primeira versão aplicável.

## Ativação

As rotas existem protegidas por autenticação e ownership, mas o frontend não
as utiliza nesta etapa. A integração controlada do cliente e o versionamento
de geração/regeneração de IA ficam para tarefas posteriores.
