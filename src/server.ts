/**
 * DARCY Backend — Ponto de Entrada do Servidor
 * ═══════════════════════════════════════════════════════════════════
 * Carrega variáveis de ambiente, valida configurações críticas
 * e inicializa o servidor Express na porta configurada.
 */

import { loadRuntimeEnvironment } from './config/loadEnvironment'
import app from './app'
import { validateEnvironment } from './config/environment'
import {
  getConfiguredAIModel,
  getConfiguredAIProviderName,
} from './services/ai/providerFactory'

loadRuntimeEnvironment()

const PORT = Number(process.env.PORT) || 3001

/* ------------------------------------------------------------------ */
/* Inicialização                                                       */
/* ------------------------------------------------------------------ */

try {
  validateEnvironment()
} catch (error) {
  const message = error instanceof Error ? error.message : 'Configuração de ambiente inválida.'
  console.error(`\n❌ [DARCY] ${message}\n   → Confira o perfil de ambiente selecionado e as variáveis obrigatórias.\n`)
  process.exit(1)
}

const server = app.listen(PORT, () => {
  const provider = getConfiguredAIProviderName()
  const model = getConfiguredAIModel()

  console.log(`
╔═══════════════════════════════════════════╗
║         DARCY API — Online                ║
╠═══════════════════════════════════════════╣
║  Porta  : ${PORT.toString().padEnd(33)}║
║  Ambiente: ${(process.env.NODE_ENV ?? 'development').padEnd(32)}║
║  Provedor: ${provider.padEnd(32)}║
║  Modelo  : ${model.padEnd(33)}║
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
