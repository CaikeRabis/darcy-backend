# DARCY — Instruções permanentes de agentes

## Hierarquia

1. Instruções do sistema e do ambiente de execução.
2. Autorização explícita do operador para a tarefa atual.
3. Este documento e os demais documentos mestres de governança.
4. Documentação técnica específica do repositório.
5. Preferências operacionais registradas em tarefas.

Em caso de conflito, prevalece a instrução de maior prioridade. Uma autorização
para uma operação não autoriza operações diferentes.

## Autonomia técnica

É permitido investigar, implementar, testar e documentar mudanças locais que
estejam explicitamente dentro da tarefa autorizada. Decisões de baixo risco
devem ser tomadas de forma incremental e reversível.

Push, merge, deploy, migrations remotas, escrita em bancos remotos, chamadas
pagas de IA, uso de credenciais e operações destrutivas exigem autorização
específica.

## Segurança

- Nunca registrar credenciais, tokens, cookies, connection strings ou dados
  pessoais.
- Manter Alpha, produção e E2E isolados.
- Não desabilitar guards para obter um resultado positivo.
- Não usar dados reais em testes sintéticos.
- Preservar arquivos locais não relacionados (`.env`, `.serena/`,
  `.DS_Store`, `experiments/` e equivalentes).

## Validação

Antes de considerar uma tarefa concluída, conferir os arquivos alterados,
testes pertinentes, typecheck, build e verificações estáticas aplicáveis.
Distinguir claramente evidência local, remota, documentada, inferida e pendente.

## Commits e pushes

Commits locais são permitidos quando a tarefa os autorizar e os testes estiverem
aprovados. Usar stage explícito por caminho, nunca `git add .` ou `git add -A`.
Conferir `git diff --cached --name-only` e `git diff --cached --check`.

Push exige aprovação explícita posterior, identificando repositório, branch e
HEAD/conjunto de commits. Não fazer force-push, merge destrutivo ou alteração de
branches protegidas.

## Continuidade e interrupção

Após uma tarefa concluída, avançar para a próxima tarefa local elegível do ciclo
sem solicitar microaprovações. Se houver bloqueio, registrar causa e continuar
somente frentes independentes já autorizadas.

Após interrupção, retomar a partir do estado Git e dos testes efetivamente
registrados; não presumir que uma execução parcial foi concluída.

## Relatórios

Todo relatório deve informar estado Git, arquivos alterados, testes executados,
operações remotas não executadas, riscos e pendências. O sucesso local não deve
ser apresentado como validação de produção.
