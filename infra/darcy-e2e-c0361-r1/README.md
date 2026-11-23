# Stack DARCY E2E R1 — `darcy-e2e-c0361-r1`

Esta definição é independente da stack original `darcy-e2e-c0361` e não pode
reutilizar `darcy-e2e-c0361_db`.

- Gateway/Auth: `127.0.0.1:55521`
- PostgreSQL: `127.0.0.1:55522`
- Rede: `darcy-e2e-c0361-r1_network`
- Volume: `darcy-e2e-c0361-r1_db`
- Serviços: PostgreSQL, GoTrue e Kong
- Imagens: referências imutáveis por digest

Os valores de `DARCY_E2E_POSTGRES_PASSWORD` e `DARCY_E2E_JWT_SECRET` devem ser
recuperados pelo adaptador protegido da identidade R1 em etapa autorizada. Não
preencher `.env.example`, não passar segredos em argumentos e não iniciar esta
stack sem comprovar o daemon, as portas, as labels, a rede, o volume e a saúde.

O launcher não executa migrations Prisma automaticamente e o marcador
`DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED` só pode ser fornecido após comprovação
operacional real. Esta definição foi apenas preparada; nenhum container ou
volume R1 foi criado.
