# Fase 4B.1 — C04: restauração segura de versões

## Endpoint

`POST /api/v1/modulos/resumo-academico/:projectId/versions/:versionId/restore`

Requer autenticação, ownership do projeto e corpo estrito:

```json
{ "expectedRevision": 4, "operationId": "op-123" }
```

## Regras

1. A versão de origem deve pertencer ao mesmo projeto `resumo_academico`.
2. A revisão deve coincidir com a revisão persistida; divergência resulta em
   `409 RESUMO_PROGRESS_REVISION_CONFLICT`.
3. A restauração substitui apenas o texto do escopo escolhido e cria nova
   versão com origem `restauracao`.
4. Seções restauradas recebem `em_revisao`; o pesquisador deve aprová-las de
   novo para criar outro marco semântico.
5. O evento `restauracao` recebe `contentVersionRef`; a nova versão aponta a
   versão de origem em `previousVersionId`.
6. `operationId` é idempotente. Reenvio do mesmo comando não duplica evento ou
   versão; outra versão com a mesma identidade é rejeitada.
7. Falhas de ownership, versão ou validação não expõem conteúdo de terceiros.

## Atomicidade

Atualização do JSONB, incremento de `revision`, criação do evento, criação da
versão e vínculo `contentVersionRef` ocorrem na mesma transação serializável.
Qualquer falha reverte todos os efeitos.

## Frontend

O painel opt-in permite selecionar uma versão para restauração ou duas para
comparação. A restauração exige confirmação nativa, bloqueia-se quando há
conflito ou autosave não confirmado, hidrata o progresso retornado pelo servidor
e atualiza a revisão confirmada. Cancelamento não realiza requisição.

## Validação

O C04 foi validado offline. Não houve aplicação de migration, escrita E2E,
acesso Alpha/produção, chamada real de IA, commit ou push.
