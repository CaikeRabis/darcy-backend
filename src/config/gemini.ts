/** Modelo Gemini usado por todas as chamadas e metadados da API. */
export const GEMINI_MODEL =
  process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash-lite'
