# DARCY — Proposta e registro do ciclo C04

## Objetivo

Estabilizar o histórico acadêmico publicado no ciclo C03 e implementar a
restauração explícita, autenticada e transacional de versões textuais, sem
ativar a funcionalidade em Alpha/produção e sem executar escrita remota.

## Escopo e estado local

| ID | Objetivo | Estado local | Evidência |
|---|---|---|---|
| C04-T1 | Estabilizar fixture, observação e estados do histórico | VALIDADA LOCALMENTE | Código C03 auditado; regressões backend/frontend aprovadas |
| C04-T2 | Serviço e comando autenticado de restauração | VALIDADA LOCALMENTE | POST opt-in, ownership, revisão, idempotência e transação |
| C04-T3 | Integração de restauração no frontend | VALIDADA LOCALMENTE | Confirmação explícita, seleção única, hidratação e bloqueios |
| C04-T4 | Testes offline e preparação E2E | VALIDADA LOCALMENTE | 204 testes backend, 74 frontend, typechecks e builds |
| C04-T5 | Governança e encerramento local | EM ANDAMENTO | Documentos canônicos e proposta C05 preparados |

## Contrato de restauração

`POST /api/v1/modulos/resumo-academico/:projectId/versions/:versionId/restore`

Corpo:

```json
{
  "expectedRevision": 4,
  "operationId": "uuid-ou-chave-estavel"
}
```

O backend valida autenticação, ownership, projeto `resumo_academico`, versão
pertencente ao mesmo projeto e revisão esperada. A operação altera somente o
escopo textual da versão: seção restaurada recebe `status: em_revisao`; resumo
completo também atualiza `numero_palavras`. Demais seções, decisões autorais e
classificação CNPq permanecem intactas.

Em uma transação serializável, progresso/revisão, evento `restauracao`, nova
versão `restauracao` e `contentVersionRef` são gravados juntos. A nova versão
usa `previousVersionId` apontando para a versão restaurada. Conflitos retornam
HTTP 409 sem efeitos parciais; versão inexistente retorna 404; entradas
inválidas retornam 400/422.

`operationId` é convertido em identidade estável `restoration-<operationId>`
para o evento e `sourceEventId`. Reenvio idêntico é idempotente; reutilização
da mesma operação com outra versão é rejeitada.

## Flags e segurança

O painel e a ação de restauração permanecem atrás de
`VITE_RESUMO_HISTORY_ENABLED=enabled`; o padrão continua desativado. Nenhuma
configuração Alpha/produção foi alterada. Não foram executadas migrations,
testes E2E com escrita remota, deploy ou chamadas pagas de IA.

Foi criada apenas a migration local aditiva
`20261103120000_resumo_academico_restoration_event`, necessária para o novo
valor enum `restauracao`. Ela não foi aplicada a banco algum.

## Validação local

- Backend: Prisma validate, 204 testes Vitest, test-typecheck, TypeScript,
  build e `git diff --check` aprovados.
- Frontend: 74 testes Vitest, TypeScript, build, typecheck E2E e
  `git diff --check` aprovados.
- Nenhum teste remoto foi executado no C04.

## Gate E2E proposto

Antes de qualquer execução remota, submeter autorização específica para o
launcher protegido no `darcy-e2e`, com guards de Auth/DB/URL, migration
explicitamente verificada, projeto sintético exclusivo e cleanup autenticado.
Cobertura: restauração válida, ownership A/B, versão inexistente, 409,
reenvio idempotente, duas restaurações distintas, rollback, preservação de
seções e estados frontend de confirmação/cancelamento.

## Ressalvas e próximos passos

O fixture visual do C03 criou eventos sem `contentVersionRef`, por isso a
assertion correspondente segue registrada como ressalva histórica. Estados
vazio/erro e fluxo legado precisam de homologação visual futura. A
proveniência de geração IA continua não comprovável pelo backend. O próximo
ciclo proposto é C05, dedicado à validação E2E autorizada e à preparação de
ativação gradual; não iniciado automaticamente.
