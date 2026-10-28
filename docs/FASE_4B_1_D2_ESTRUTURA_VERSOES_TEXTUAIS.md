# DARCY — Estrutura de versões textuais (Task 4B.1-D2)

## Escopo

Esta etapa cria apenas a estrutura Prisma e a migration aditiva para versões
textuais. Nenhum serviço, endpoint ou fluxo de autosave cria versões ainda.

## Modelo

`ResumoAcademicoTextVersion` é vinculado ao `Project` e contém `scopeKey`,
seção opcional, `versionNumber`, `progressRevision`, `origin`, texto integral,
hash SHA-256 (hexadecimal), linhagem opcional e evento de origem opcional.

`scopeKey` deve ser um identificador estável, como uma seção do resumo ou
`resumo_completo`. A unicidade `(projectId, scopeKey, versionNumber)` mantém a
numeração independente por projeto e escopo.

`progressRevision`, `versionNumber` e o `sequence` do histórico são contadores
distintos:

- `progressRevision`: revisão otimista do estado materializado;
- `sequence`: ordem dos eventos de domínio;
- `versionNumber`: ordem dos snapshots textuais de um escopo.

## Origem

Os valores `ia_assistida`, `pesquisador` e `restauracao` descrevem a operação
que produziu o snapshot. Eles não são declaração de autoria intelectual.

O cliente não deve poder certificar a origem enviando uma string livre. A
implementação futura deverá obter a origem de uma operação de domínio do
servidor, por exemplo uma geração concluída ou uma confirmação explícita do
pesquisador.

## Integridade e limites

- O conteúdo é imutável por contrato de aplicação; não haverá `UPDATE` de uma
  versão criada.
- `contentHash` permite detectar conteúdo repetido e implementar idempotência.
- A aplicação futura deve limitar o texto a 200.000 caracteres por versão,
  rejeitando valores maiores antes da persistência.
- Não armazenar prompts, tokens, credenciais ou histórico integral de chat.
- A retenção inicial é indefinida; exclusão automática não faz parte desta
  etapa. Uma política de retenção deverá ser aprovada antes de ser criada.
- Projetos legados não recebem versões retroativas automaticamente. A primeira
  versão nasce no próximo marco semântico válido.

## Associação com histórico

`sourceEventId` é opcional e único. O campo existente `contentVersionRef` do
evento permanece compatível; a captura futura deve associá-lo sem alterar
eventos antigos.

## Marcos planejados

Versões somente devem ser criadas após confirmação de operações como geração,
regeneração, aprovação, edição explicitamente salva ou restauração. Autosave e
digitação comum não criam snapshots.

## Segurança futura

Toda leitura deverá validar autenticação e ownership do projeto. Endpoints de
texto completo devem ser paginados/limitados e nunca expor dados de outro
projeto. A restauração deverá exigir `expectedRevision`, criar uma nova versão
e preservar todas as versões anteriores.
