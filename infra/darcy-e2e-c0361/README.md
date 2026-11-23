# Stack local DARCY E2E `darcy-e2e-c0361`

Esta definição é exclusiva do DARCY e não reutiliza a stack Compose `supabase` existente.

- Gateway/Auth: `127.0.0.1:55421`
- PostgreSQL: `127.0.0.1:55422`
- Rede: `darcy-e2e-c0361_network`
- Volume: `darcy-e2e-c0361_db`
- Imagens: referências por digest, disponíveis localmente na auditoria B3-A

O arquivo `.env.example` contém apenas placeholders. Os valores reais devem ser
gerados em arquivo temporário protegido, fora do Git e sem serem impressos.

O launcher deve validar daemon, manifesto, labels, rede, volume, portas, imagens,
endpoints e health checks antes de fornecer `DARCY_E2E_LOCAL_OPERATIONAL_VERIFIED`.
Ele não inicia o backend, frontend ou migrations Prisma.
