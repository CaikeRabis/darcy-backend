/**
 * DARCY Backend — Ponto de Entrada do Servidor
 * ═══════════════════════════════════════════════════════════════════
 * Carrega variáveis de ambiente, valida configurações críticas
 * e inicializa o servidor Express na porta configurada.
 */

import 'dotenv/config'
import app from './app'

const PORT = Number(process.env.PORT) || 3001

/* ------------------------------------------------------------------ */
/* Validação de ambiente na inicialização                              */
/* ------------------------------------------------------------------ */

function validateEnvironment(): void {
  const required: string[] = ['GEMINI_API_KEY']

  const missing = required.filter(
    (key) => !process.env[key] || process.env[key] === 'your_gemini_api_key_here',
  )

  if (missing.length > 0) {
    console.error(
      `\n❌ [DARCY] Variáveis de ambiente obrigatórias não configuradas:\n` +
      missing.map((k) => `   • ${k}`).join('\n') +
      `\n\n   → Copie .env.example para .env e preencha os valores.\n`
    )
    process.exit(1)
  }
}

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

validateEnvironment()

const server = app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║         DARCY API — Online                ║
╠═══════════════════════════════════════════╣
║  Porta  : ${PORT.toString().padEnd(33)}║
║  Ambiente: ${(process.env.NODE_ENV ?? 'development').padEnd(32)}║
║  Modelo  : gemini-1.5-flash               ║
╚═══════════════════════════════════════════╝
  `)
})

/* ------------------------------------------------------------------ */
/* Graceful Shutdown                                                   */
/* ------------------------------------------------------------------ */

const shutdown = (signal: string) => {
  console.log(`\n[DARCY] Sinal ${signal} recebido — encerrando servidor...`)
  server.close(() => {
    console.log('[DARCY] Servidor encerrado com sucesso.')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))
