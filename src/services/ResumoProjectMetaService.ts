/**
 * Projeto: DARCY — Sistema Inteligente de Orientação Científica
 *
 * Autor: Caike Carvalho Rabis
 *
 * Titular dos direitos patrimoniais: Escrita com Ciência
 *
 * Copyright (c) 2026 Escrita com Ciência.
 *
 * Todos os direitos reservados.
 *
 * Consulte NOTICE.txt para informações de titularidade.
 */


import {
  ResumoAcademicoStateSchema,
  type ResumoAcademicoState,
} from '../schemas/resumoAcademico.schema'

export type ResumoSectionId =
  | 'contexto'
  | 'objetivo'
  | 'metodologia'
  | 'fundamentacao_teorica'
  | 'resultados'

export interface ResumoSectionMeta {
  id: ResumoSectionId
  completion: 0 | 50 | 100
  status: 'pendente' | 'em_revisao' | 'aprovado'
}

export interface ResumoProjectMeta {
  progressPercent: number
  status: 'rascunho' | 'em-andamento' | 'revisao' | 'concluido'
  currentSection: ResumoSectionId
  sections: ResumoSectionMeta[]
}

const RESUMO_SECTIONS: ResumoSectionId[] = [
  'contexto',
  'objetivo',
  'metodologia',
  'fundamentacao_teorica',
  'resultados',
]

function completionFromStatus(status: ResumoSectionMeta['status']): 0 | 50 | 100 {
  if (status === 'aprovado') return 100
  if (status === 'em_revisao') return 50
  return 0
}

export function deriveResumoProjectMeta(documento: ResumoAcademicoState): ResumoProjectMeta {
  const sections = RESUMO_SECTIONS.map((id) => ({
    id,
    status: documento[id].status,
    completion: completionFromStatus(documento[id].status),
  }))
  const progressPercent = sections.reduce((total, section) => total + section.completion, 0) / sections.length
  const allApproved = sections.every((section) => section.status === 'aprovado')
  const hasReview = sections.some((section) => section.status === 'em_revisao')
  const hasSectionProgress = sections.some((section) => section.completion > 0)
  const currentSection = sections.find((section) => section.status !== 'aprovado')?.id ?? 'resultados'
  const status: ResumoProjectMeta['status'] = !documento.tema.trim() || !hasSectionProgress
    ? 'rascunho'
    : allApproved
      ? 'concluido'
      : hasReview
        ? 'revisao'
        : 'em-andamento'

  return { progressPercent, status, currentSection, sections }
}

export function derivePersistedResumoProjectMeta(progress: unknown): ResumoProjectMeta {
  const parsed = ResumoAcademicoStateSchema.safeParse(progress)

  if (!parsed.success) {
    return {
      progressPercent: 0,
      status: 'rascunho',
      currentSection: 'contexto',
      sections: RESUMO_SECTIONS.map((id) => ({ id, status: 'pendente', completion: 0 })),
    }
  }

  return deriveResumoProjectMeta(parsed.data)
}
