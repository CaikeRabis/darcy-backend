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

import darcyRoutes from './routes/darcy.routes'

const app: Application = express()

/* ------------------------------------------------------------------ */
/* Middlewares de segurança e utilidade                                */
/* ------------------------------------------------------------------ */

// Helmet — adiciona cabeçalhos HTTP de segurança
app.use(helmet())

// CORS — permite apenas a origem configurada na env
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
)

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
  console.error('[App] Erro não tratado:', err)
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'Erro interno do servidor.'
        : err.message,
    },
  })
})

export default app
