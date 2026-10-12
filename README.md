# DARCY Backend

## CI

O workflow `.github/workflows/ci.yml` executa em `push` e `pull_request`:

```bash
npm ci
npm run typecheck
npm run build
npm test
npx prisma validate
```

A CI usa apenas URLs PostgreSQL sintáticas e descartáveis para `prisma validate`; ela não
conecta ao Supabase, não executa migration, `db push` ou deploy, e não precisa de chaves de
IA, tokens ou credenciais reais.

Os smoke tests de IA real e os E2E autenticados permanecem manuais/protegidos. Eles não são
executados em `push` ou `pull_request`.
