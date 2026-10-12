/**
 * DARCY Backend — App Express
 * ═══════════════════════════════════════════════════════════════════
 * Configura middlewares globais e registra rotas.
 * Separado do server.ts para facilitar testes de integração.
 */

import express, { type Application, type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'

import { CorsOriginNotAllowedError, createCorsOptions } from './config/cors'
import authRoutes from './routes/auth.routes'
import darcyRoutes from './routes/darcy.routes'
import projectRoutes from './routes/projects.routes'
import resumoAcademicoRoutes from './routes/resumoAcademico.routes'

const app: Application = express()

/* ------------------------------------------------------------------ */
/* Middlewares de segurança e utilidade                                */
/* ------------------------------------------------------------------ */

// Helmet — adiciona cabeçalhos HTTP de segurança
app.use(helmet())

// CORS — whitelist exata de origens, definida por ambiente.
app.use(cors(createCorsOptions()))

// Logging das requisições (formato compacto em prod, colorido em dev)
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'))

// Parseia body JSON (limite de 1mb para evitar abuso)
app.use(express.json({ limit: '1mb' }))

/* ------------------------------------------------------------------ */
/* Rotas                                                               */
/* ------------------------------------------------------------------ */

// Rota raiz — confirma que a API está online
app.get('/', (_req: Request, res: Response) => {
  res.json({
    service: 'DARCY API',
    version: '1.0.0',
    docs: '/api/darcy/health',
  })
})

// Rotas do DARCY
app.use('/api/darcy', darcyRoutes)

// Rota de prova da infraestrutura de autenticação Supabase.
app.use('/api/auth', authRoutes)

// Operações persistentes de projetos, sempre vinculadas ao usuário autenticado.
app.use('/api/projects', projectRoutes)

// Persistência do módulo Resumo Acadêmico, vinculada ao Project do usuário autenticado.
app.use('/api/v1/modulos/resumo-academico', resumoAcademicoRoutes)

/* ------------------------------------------------------------------ */
/* Handler de erros global                                             */
/* ------------------------------------------------------------------ */

// Rota não encontrada
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint não encontrado.',
    },
  })
})

// Handler de erros não capturados nas rotas
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const isCorsOriginError = err instanceof CorsOriginNotAllowedError
  const status = isCorsOriginError ? err.statusCode : 500

  console.error('[App] Erro não tratado:', err)
  res.status(status).json({
    ok: false,
    error: {
      code: isCorsOriginError ? 'CORS_ORIGIN_NOT_ALLOWED' : 'INTERNAL_SERVER_ERROR',
      message: isCorsOriginError
        ? 'Origem não autorizada.'
        : process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor.'
        : err.message,
    },
  })
})

export default app
