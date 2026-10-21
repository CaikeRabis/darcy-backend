/**
 * DARCY Backend — Tipos de Domínio Compartilhados
 * ═══════════════════════════════════════════════════════════════════
 * Espelha os contratos do frontend para garantir consistência
 * na comunicação via API REST.
 */

/* ------------------------------------------------------------------ */
/* Fases metodológicas                                                 */
/* ------------------------------------------------------------------ */

export type PhaseId =
  | 'tema'
  | 'problema'
  | 'referencial'
  | 'metodologia'
  | 'resultados'
  | 'discussao'
  | 'conclusao'

export type ProjectType =
  | 'artigo'
  | 'dissertacao'
  | 'tese'
  | 'tcc'
  | 'projeto-pesquisa'
  | 'resumo-academico'

/* ------------------------------------------------------------------ */
/* Contexto de projeto enviado pelo frontend                           */
/* ------------------------------------------------------------------ */

/**
 * Contexto mínimo do projeto que o frontend envia em cada requisição.
 * O controller valida e repassa ao AIService.
 */
export interface ProjectContext {
  /** Identificador do Project, validado contra o usuário autenticado pelo controller. */
  projectId?: string
  /** Título do projeto de pesquisa */
  projectTitle: string
  /** Tipo de trabalho acadêmico */
  projectType: ProjectType
  /** Fase metodológica ativa */
  currentPhase: PhaseId | 'resumo-academico'
  /** Conteúdo da seção ativa no editor (texto plano) */
  activeSectionContent?: string
  /** Área/linha de pesquisa do projeto */
  researchField?: string
  /** Histórico de mensagens da conversa atual */
  conversationHistory?: ConversationMessage[]
  /** Preenchido exclusivamente pelo backend a partir do progresso do projeto autenticado. */
  decisaoAutoralContextual?: string
}

/**
 * Uma mensagem no histórico de conversa para manter contexto multi-turn.
 */
export interface ConversationMessage {
  role: 'user' | 'model'
  content: string
}

/* ------------------------------------------------------------------ */
/* Ações Rápidas do Editor                                             */
/* ------------------------------------------------------------------ */

export type QuickActionId =
  | 'validar-coerencia'
  | 'sugerir-referencias'
  | 'checar-objetivos'
  | 'revisar-clareza'
  | 'identificar-lacunas'

/* ------------------------------------------------------------------ */
/* Contratos de Resposta da API DARCY                                  */
/* ------------------------------------------------------------------ */

/**
 * Estrutura de um Card clicável retornado pelo DARCY.
 * O frontend renderiza esses cards como sugestões de ação.
 */
export interface DarcyCard {
  id: string
  tipo: 'reflexao' | 'sugestao' | 'alerta' | 'validacao' | 'recurso'
  titulo: string
  conteudo: string
  /** Ação sugerida quando o usuário clica no card */
  cta?: string
  /** Prioridade de exibição */
  prioridade: 'alta' | 'media' | 'baixa'
}

/**
 * Diagnóstico estruturado da seção ativa.
 */
export interface DiagnosticoSecao {
  clareza: number        // 0–100
  coerencia: number      // 0–100
  completude: number     // 0–100
  /** Pontos fortes identificados */
  pontosFortes: string[]
  /** Pontos a desenvolver */
  pontosAMelhorar: string[]
}

/**
 * Corpo completo da resposta do DARCY para o frontend.
 * Todos os campos opcionais dependem do tipo de requisição.
 */
export interface DarcyResponse {
  /** Mensagem principal em linguagem natural (obrigatório) */
  mensagem: string
  /** Cards clicáveis de orientação (opcional) */
  cards?: DarcyCard[]
  /** Diagnóstico estruturado da seção (opcional, presente em ações de análise) */
  diagnostico?: DiagnosticoSecao
  /** Perguntas estratégicas para reflexão do pesquisador */
  perguntasEstrategicas?: string[]
  /** Sugestões de referências bibliográficas */
  sugestoesReferencias?: string[]
  /** Opções de respostas dinâmicas geradas em lote para uma etapa inteira (mapa de questionId para array de opções) */
  opcoesDinamicas?: Record<string, string[]>
}

/* ------------------------------------------------------------------ */
/* Resposta genérica da API                                            */
/* ------------------------------------------------------------------ */

export interface ApiSuccess<T> {
  ok: true
  data: T
}

export interface ApiError {
  ok: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError
