# DARCY — Contrato de histórico do Resumo Acadêmico

## Finalidade

`ResumoAcademicoProgress` continua sendo o estado atual materializado do projeto. `ResumoAcademicoHistoryEvent` registra acontecimentos de domínio imutáveis, sem repetir textos completos nem registrar cada tecla ou autosave.

## Evento

Cada evento contém:

- `id`: identificador único gerado pelo banco.
- `projectId`: projeto de Resumo Acadêmico já validado para o perfil autenticado.
- `sequence`: inteiro único e crescente por projeto; é o cursor de paginação.
- `type`: `rascunho_gerado`, `rascunho_regenerado`, `secao_aprovada`, `decisao_autoral_alterada`, `classificacao_cientifica_alterada` ou `resumo_consolidado`.
- `actor`: origem operacional definida pelo servidor. Nesta etapa, é sempre `pesquisador`, pois o PUT foi solicitado pela sessão autenticada. Isto não declara autoria literária do texto.
- `section`: seção afetada, quando aplicável.
- `createdAt`: data gerada pelo banco.
- `summary`: descrição segura, sem respostas, prompts, credenciais ou texto acadêmico integral.
- `contentVersionRef`: reservado para uma versão textual relevante futura; permanece nulo nesta etapa.

Não existe rota pública para inserir, alterar ou excluir eventos.

## Registro confiável

O backend compara o JSONB persistido ao novo estado validado dentro da mesma transação serializável que faz o upsert. Só são criados eventos quando há mudança efetiva nos campos de domínio:

- texto sugerido vazio → preenchido: rascunho gerado;
- texto sugerido preenchido → texto diferente: rascunho regenerado;
- status não aprovado → aprovado: seção aprovada;
- alteração semântica da decisão autoral ou classificação científica;
- resumo completo vazio → preenchido: resumo consolidado.

Repetir o mesmo PUT não cria evento. Como a geração ainda é solicitada pelo frontend e persistida em outra chamada, o servidor não atribui esses eventos ao DARCY nesta fase. Uma futura operação de geração orquestrada pelo backend poderá registrar `actor: darcy` com evidência de origem.

## Consistência e paginação

O upsert e os eventos derivados compartilham uma transação `Serializable`. A sequência é calculada a partir do último evento do mesmo projeto e protegida por `UNIQUE(project_id, sequence)`. Conflitos serializáveis do Prisma (`P2034`) ou colisões da chave única sob concorrência (`P2002`) são reexecutados no máximo três vezes; a nova tentativa compara novamente o estado persistido e não duplica eventos.

A leitura usa `GET /api/v1/modulos/resumo-academico/:projectId/history?limit=25&beforeSequence=42`, ordenada por `sequence DESC`. `nextCursor` é a sequência do último item retornado quando há próxima página.

## Versões futuras

Textos completos não são copiados para eventos. A próxima etapa deve criar uma entidade separada de versão textual somente em marcos relevantes — por exemplo, geração de rascunho, regeneração, aprovação e edição explicitamente salva — e preencher `contentVersionRef` no evento correspondente. A entidade deverá conter hash, seção, origem e conteúdo ou representação eficiente, com retenção e reversão definidas antes de exposição na interface.

## Limites atuais

Não há reversão, diff, histórico de chat, endpoint de escrita de eventos, nem atribuição automática de autoria de IA. A autorização continua obrigatória na camada de aplicação: relações Prisma não substituem a validação de `profileId`.
