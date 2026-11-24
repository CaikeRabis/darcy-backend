# Verificação operacional da stack E2E R1

O verificador `scripts/verify-darcy-e2e-r1-stack.cjs` é somente de leitura. Ele
consulta diretamente o daemon Docker local, inspeciona labels, imagens, rede,
volume, portas e estado dos três serviços R1, e consulta `/auth/v1/health` pelo
gateway loopback. Não lê `Config.Env`, não recupera segredos e não cria ou
remove recursos.

As chamadas Docker possuem timeout de 10 segundos e limite de 256 KiB. O
health check possui timeout de 5 segundos, limite de 64 KiB, não segue
redirecionamentos e exige HTTP 200, `application/json` e o objeto GoTrue com
`version`, `name` e `description` textuais. A rede é conferida nos dois
sentidos: seus membros devem ser exatamente os três IDs R1 e cada container
deve estar somente nessa rede.

O marcador `DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED=enabled` não é persistido. O
launcher Prisma só o disponibiliza ao processo filho depois que o verificador
retorna com sucesso. A autorização de migration continua independente e exige
`DARCY_E2E_MIGRATION_APPROVED=apply` apenas para `migrate deploy`.
Snapshots estruturais (inclusive os produzidos por testes) nunca emitem o
marcador. Os limites do launcher Prisma são 15 s para `validate`, 30 s para
`migrate status`, 120 s para `migrate deploy` e 30 s para a verificação Docker;
timeout em `deploy` deixa o estado potencialmente indeterminado e não dispara
retry automático.

## Fluxo futuro autorizado

1. Confirmar branch, HEAD e worktree.
2. Executar o verificador contra o daemon Docker local e confirmar a identidade
   exclusiva de `darcy-e2e-c0361-r1`.
3. Recuperar os segredos R1 pelo adaptador protegido, somente em memória e sem
   registrá-los.
4. Retomar a stack existente sem recriar volume, rede ou credenciais.
5. Confirmar PostgreSQL saudável e GoTrue/Kong em execução com health check
   funcional pelo gateway.
6. Fazer backup autorizado do volume R1 fora do repositório, preservando o
   original para recuperação.
7. Executar `npm run prisma:e2e:validate` e `npm run prisma:e2e:migrate:status`.
8. Aplicar migrations somente mediante autorização independente, pelo launcher
   protegido:

   ```text
   DARCY_E2E_MIGRATION_APPROVED=apply npm run prisma:e2e:migrate:deploy
   ```

9. Revalidar o status, executar os testes sintéticos A/B e limpar somente os
   projetos criados pela execução.
10. Encerrar os containers sem remover o volume R1.

Qualquer divergência de identidade, health check, imagem, porta, volume ou rede
interrompe o fluxo. Não usar `migrate reset`, `db push`, `docker volume prune`, a
stack `supabase` genérica ou o volume `darcy-e2e-c0361_db`.
