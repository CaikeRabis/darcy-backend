/**
 * ════════════════════════════════════════════════════════════════════
 *  DARCY — GeminiService
 *  Camada de abstração para comunicação com a API Google Gemini
 * ════════════════════════════════════════════════════════════════════
 *
 *  Responsabilidades:
 *    • Inicializar o cliente GoogleGenerativeAI com a chave da env
 *    • Construir System Prompts contextuais com a persona do DARCY
 *    • Orquestrar chamadas com generationConfig para JSON forçado
 *    • Parsear e validar a resposta antes de retornar ao controller
 *    • Centralizar tratamento de erros de rede/quota da API
 *
 *  Uso:
 *    const service = GeminiService.getInstance()
 *    const result = await service.generateDarcyResponse(context, message)
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  type GenerationConfig,
  type Content,
} from '@google/generative-ai'

import type {
  ProjectContext,
  DarcyResponse,
  ApiResponse,
  QuickActionId,
} from '../types/darcy.types'

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** Modelo utilizado — gemini-3.5-flash-lite para renovar as cotas com a última versão leve suportada na v1beta */
const GEMINI_MODEL = 'gemini-3.5-flash-lite'

/**
 * Configuração de geração padrão para respostas do DARCY.
 * Temperatura baixa → respostas acadêmicas precisas e determinísticas.
 */
const DEFAULT_GENERATION_CONFIG: GenerationConfig = {
  responseMimeType: 'application/json',
  temperature: 0.2,
  topP: 0.8,
  topK: 40,
  maxOutputTokens: 2048,
}

/**
 * Filtros de segurança — permissivos apenas o suficiente para contexto acadêmico.
 * Mantemos BLOCK_MEDIUM_AND_ABOVE para conteúdo sensível.
 */
const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,        threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
]

/* ------------------------------------------------------------------ */
/* Mapeamentos de labels                                               */
/* ------------------------------------------------------------------ */

const PHASE_LABELS: Record<string, string> = {
  tema:         'Definição do Tema',
  problema:     'Formulação do Problema de Pesquisa',
  referencial:  'Referencial Teórico',
  metodologia:  'Metodologia',
  resultados:   'Resultados e Análise',
  discussao:    'Discussão',
  conclusao:    'Conclusão',
}

const PROJECT_TYPE_LABELS: Record<string, string> = {
  'artigo':           'Artigo Científico',
  'dissertacao':      'Dissertação de Mestrado',
  'tese':             'Tese de Doutorado',
  'tcc':              'Trabalho de Conclusão de Curso',
  'projeto-pesquisa': 'Projeto de Pesquisa',
  'resumo-academico': 'Resumo Acadêmico',
}

/* ------------------------------------------------------------------ */
/* Builders de prompt                                                  */
/* ------------------------------------------------------------------ */

/**
 * Constrói a System Instruction que define a persona do DARCY.
 * Esta instrução é injetada em TODAS as chamadas ao Gemini para
 * garantir consistência de voz e comportamento.
 */
function buildSystemInstruction(context: ProjectContext): string {
  const phaseLabel   = PHASE_LABELS[context.currentPhase]   ?? context.currentPhase
  const projectLabel = PROJECT_TYPE_LABELS[context.projectType] ?? context.projectType

  return `
Você é DARCY, o Orientador Digital de Pesquisa Científica — um sistema de IA especializado no apoio à escrita acadêmica.

## Sua Identidade
- Gênero: masculino
- Tom: acadêmico, preciso, encorajador, mas rigoroso
- Linguagem: formal-acadêmica brasileira (normas ABNT quando aplicável)
- Papel: orientador que provoca reflexão, NÃO escreve pelo pesquisador

## Contexto do Projeto Atual
- **Título**: ${context.projectTitle}
- **Tipo de trabalho**: ${projectLabel}
- **Fase metodológica ativa**: ${phaseLabel}
${context.researchField ? `- **Área de pesquisa**: ${context.researchField}` : ''}
${context.activeSectionContent
  ? `- **Conteúdo atual da seção** (últimos ~500 chars):\n  "${context.activeSectionContent.slice(-500)}"`
  : ''}

## Princípios de Orientação
1. Provoque reflexão com perguntas estratégicas antes de dar respostas diretas
2. Valide a coerência metodológica entre as seções
3. Sinalize lacunas e inconsistências com evidências textuais
4. Sugira referências bibliográficas quando pertinente (formato ABNT)
5. Adapte o nível de detalhe à fase atual do trabalho

## Formato de Saída — OBRIGATÓRIO
Você DEVE retornar um JSON válido seguindo EXATAMENTE este schema:

\`\`\`json
{
  "mensagem": "string — resposta principal em linguagem natural (obrigatório)",
  "cards": [
    {
      "id": "string — identificador único snake_case",
      "tipo": "reflexao | sugestao | alerta | validacao | recurso",
      "titulo": "string — título curto do card (max 60 chars)",
      "conteudo": "string — corpo da orientação",
      "cta": "string opcional — call-to-action clicável",
      "prioridade": "alta | media | baixa"
    }
  ],
  "diagnostico": {
    "clareza": 0-100,
    "coerencia": 0-100,
    "completude": 0-100,
    "pontosFortes": ["string"],
    "pontosAMelhorar": ["string"]
  },
  "perguntasEstrategicas": ["string"],
  "sugestoesReferencias": ["string — formato ABNT quando possível"],
  "opcoesDinamicas": {
    "question_id": ["opcao1", "opcao2", "opcao3", "opcao4"]
  }
}
\`\`\`

- Os campos \`cards\`, \`diagnostico\`, \`perguntasEstrategicas\`, \`sugestoesReferencias\` e \`opcoesDinamicas\` são OPCIONAIS.
- Inclua-os apenas quando forem relevantes para a solicitação.
- Nunca retorne texto fora do JSON — apenas o objeto JSON.
`.trim()
}

/**
 * Monta o histórico de conversa no formato exigido pelo Gemini (multi-turn).
 */
function buildConversationHistory(context: ProjectContext): Content[] {
  if (!context.conversationHistory?.length) return []

  return context.conversationHistory.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }))
}

/**
 * Builds the system prompt for Quick Actions do editor.
 */
function buildQuickActionPrompt(actionId: QuickActionId, context: ProjectContext): string {
  const baseCtx = context.activeSectionContent
    ? `Analise o seguinte trecho do trabalho:\n\n"${context.activeSectionContent}"\n\n`
    : ''

  const prompts: Record<QuickActionId, string> = {
    'validar-coerencia':
      `${baseCtx}Execute uma validação completa de coerência metodológica desta seção em relação à fase "${PHASE_LABELS[context.currentPhase]}". ` +
      `Retorne um diagnóstico detalhado com pontuações de clareza, coerência e completude, além de cards com os principais pontos.`,

    'sugerir-referencias':
      `${baseCtx}Com base no conteúdo apresentado, sugira referências bibliográficas relevantes no formato ABNT. ` +
      `Priorize obras clássicas e artigos recentes (últimos 5 anos) da área. ` +
      `Retorne as sugestões no campo \`sugestoesReferencias\` e explique brevemente a relevância de cada uma no campo \`mensagem\`.`,

    'checar-objetivos':
      `${baseCtx}Verifique se o conteúdo desta seção está alinhado com os objetivos esperados para a fase "${PHASE_LABELS[context.currentPhase]}" ` +
      `de um ${PROJECT_TYPE_LABELS[context.projectType]}. ` +
      `Identifique convergências e divergências e gere cards de alerta onde necessário.`,

    'revisar-clareza':
      `${baseCtx}Avalie a clareza, objetividade e adequação linguística do texto para o padrão acadêmico formal brasileiro. ` +
      `Aponte construções ambíguas, parágrafos mal estruturados ou jargões sem definição. ` +
      `Forneça sugestões concretas de reescrita nos cards.`,

    'identificar-lacunas':
      `${baseCtx}Identifique lacunas argumentativas, teóricas ou metodológicas nesta seção. ` +
      `O que está faltando para que ela atenda plenamente aos critérios da fase "${PHASE_LABELS[context.currentPhase]}"? ` +
      `Gere cards de tipo "alerta" para cada lacuna crítica e "sugestao" para melhorias.`,
  }

  return prompts[actionId]
}

/* ------------------------------------------------------------------ */
/* GeminiService                                                       */
/* ------------------------------------------------------------------ */

export class GeminiService {
  private static instance: GeminiService
  private readonly client: GoogleGenerativeAI

  /**
   * Construtor privado — utilize `GeminiService.getInstance()`.
   * Lança erro imediato se GEMINI_API_KEY não estiver definida.
   */
  private constructor() {
    const apiKey = process.env.GEMINI_API_KEY

    if (!apiKey || apiKey.trim() === '' || apiKey === 'your_gemini_api_key_here') {
      throw new Error(
        '[GeminiService] GEMINI_API_KEY não configurada. ' +
        'Copie .env.example para .env e defina a chave.'
      )
    }

    this.client = new GoogleGenerativeAI(apiKey)
  }

  /**
   * Singleton — garante que apenas uma instância do client seja criada.
   */
  public static getInstance(): GeminiService {
    if (!GeminiService.instance) {
      GeminiService.instance = new GeminiService()
    }
    return GeminiService.instance
  }

  /* ---------------------------------------------------------------- */
  /* Método principal                                                  */
  /* ---------------------------------------------------------------- */

  /**
   * Gera uma resposta do DARCY para uma mensagem do usuário.
   *
   * @param context  - Contexto do projeto (fase, tipo, conteúdo da seção, histórico)
   * @param userMessage - Mensagem ou pergunta do pesquisador
   * @returns ApiResponse<DarcyResponse> — sucesso ou erro tipado
   */
  public async generateDarcyResponse(
    context: ProjectContext,
    userMessage: string,
  ): Promise<ApiResponse<DarcyResponse>> {
    try {
      const model = this.client.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: buildSystemInstruction(context),
        generationConfig: DEFAULT_GENERATION_CONFIG,
        safetySettings: SAFETY_SETTINGS,
      })

      // Monta o histórico de conversa para suporte multi-turn
      const history = buildConversationHistory(context)

      const chat = model.startChat({ history })

      console.log('[Backend] Prompt Montado:', userMessage)
      const result = await chat.sendMessage(userMessage)
      const rawText = result.response.text()

      // Parseia e valida o JSON retornado pelo Gemini
      const parsed = this.parseGeminiResponse(rawText)

      return { ok: true, data: parsed }

    } catch (error) {
      return this.handleError(error)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Ações Rápidas do Editor                                           */
  /* ---------------------------------------------------------------- */

  /**
   * Executa uma "Ação Rápida" do editor (ex: validar coerência, sugerir referências).
   * Gera um prompt especializado para o actionId e chama o modelo.
   *
   * @param actionId - Identificador da ação rápida
   * @param context  - Contexto completo do projeto
   * @returns ApiResponse<DarcyResponse>
   */
  public async executeQuickAction(
    actionId: QuickActionId,
    context: ProjectContext,
  ): Promise<ApiResponse<DarcyResponse>> {
    try {
      const model = this.client.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: buildSystemInstruction(context),
        generationConfig: {
          ...DEFAULT_GENERATION_CONFIG,
          temperature: 0.1, // Temperatura ainda mais baixa para análises técnicas
        },
        safetySettings: SAFETY_SETTINGS,
      })

      const prompt = buildQuickActionPrompt(actionId, context)
      const result = await model.generateContent(prompt)
      const rawText = result.response.text()

      const parsed = this.parseGeminiResponse(rawText)

      return { ok: true, data: parsed }

    } catch (error) {
      return this.handleError(error)
    }
  }

  /* ---------------------------------------------------------------- */
  /* Utilitários privados                                              */
  /* ---------------------------------------------------------------- */

  /**
   * Parseia o texto retornado pelo Gemini como JSON.
   * O Gemini com `responseMimeType: "application/json"` retorna texto
   * diretamente parseável, mas pode ocasionalmente envolver em código fence.
   */
  private parseGeminiResponse(rawText: string): DarcyResponse {
    // Remove code fences caso o modelo os adicione por segurança
    const cleaned = rawText
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()

    let parsed: unknown

    try {
      parsed = JSON.parse(cleaned)
    } catch {
      // Se o parse falhar, retorna uma resposta de fallback estruturada
      console.warn('[GeminiService] Falha ao parsear JSON. Usando fallback.')
      return {
        mensagem: rawText,
        cards: [],
      }
    }

    // Type guard mínimo — garante que mensagem existe
    if (typeof parsed !== 'object' || parsed === null || !('mensagem' in parsed)) {
      return {
        mensagem: 'Resposta recebida, mas em formato inesperado. Tente novamente.',
        cards: [],
      }
    }

    return parsed as DarcyResponse
  }

  /**
   * Centraliza o tratamento de erros da API Gemini.
   * Distingue erros de quota, autenticação e rede para mensagens claras.
   */
  private handleError(error: unknown): ApiResponse<never> {
    console.error('[GeminiService] Erro na chamada à API:', error)

    if (error instanceof Error) {
      // Erros de quota/rate-limit da API Google
      if (error.message.includes('429') || error.message.toLowerCase().includes('quota')) {
        return {
          ok: false,
          error: {
            code: 'QUOTA_EXCEEDED',
            message: 'Limite de requisições atingido. Aguarde alguns instantes e tente novamente.',
          },
        }
      }

      // Erros de autenticação (chave inválida ou expirada)
      if (error.message.includes('401') || error.message.includes('403') || error.message.toLowerCase().includes('api key')) {
        return {
          ok: false,
          error: {
            code: 'AUTH_ERROR',
            message: 'Chave de API inválida ou sem permissão. Verifique o arquivo .env.',
          },
        }
      }

      // Conteúdo bloqueado pelos filtros de segurança
      if (error.message.toLowerCase().includes('safety') || error.message.toLowerCase().includes('blocked')) {
        return {
          ok: false,
          error: {
            code: 'CONTENT_BLOCKED',
            message: 'A mensagem foi bloqueada pelos filtros de segurança. Reformule sua solicitação.',
          },
        }
      }

      // Erros de rede/timeout
      if (error.message.toLowerCase().includes('fetch') || error.message.toLowerCase().includes('network')) {
        return {
          ok: false,
          error: {
            code: 'NETWORK_ERROR',
            message: 'Falha de conexão com a API Gemini. Verifique sua conectividade.',
          },
        }
      }

      return {
        ok: false,
        error: {
          code: 'GEMINI_ERROR',
          message: error.message,
        },
      }
    }

    return {
      ok: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: 'Erro inesperado ao processar a solicitação.',
      },
    }
  }
}
