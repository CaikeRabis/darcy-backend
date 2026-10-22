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
  CNPQ_CATALOG_METADATA,
  CNPQ_CATALOG_ROWS,
} from '../data/cnpqCatalogSnapshot'

export type CnpqLevel = 'grande_area' | 'area' | 'subarea' | 'especialidade'

export interface CnpqCatalogEntry {
  codigo: string
  nome: string
  nivel: CnpqLevel
  caminho_codigos: string[]
}

export interface CnpqClassification {
  versao_catalogo: string
  primaria: CnpqCatalogEntry
  correlatas?: CnpqCatalogEntry[]
  observacao_interdisciplinar?: string
}

interface ParsedCode {
  prefix: [string, string, string, string]
}

const CODE_PATTERN = /^(\d)\.(\d{2})\.(\d{2})\.(\d{2})-(\d)$/

function parseCode(codigo: string): ParsedCode | null {
  const match = CODE_PATTERN.exec(codigo)
  if (!match) return null

  return { prefix: [match[1], match[2], match[3], match[4]] }
}

function toLookupKey(prefix: ParsedCode['prefix']): string {
  return prefix.join('.')
}

function getLevel(prefix: ParsedCode['prefix']): CnpqLevel | null {
  const [, area, subarea, especialidade] = prefix

  if (area === '00' && subarea === '00' && especialidade === '00') return 'grande_area'
  if (area !== '00' && subarea === '00' && especialidade === '00') return 'area'
  if (area !== '00' && subarea !== '00' && especialidade === '00') return 'subarea'
  if (area !== '00' && subarea !== '00' && especialidade !== '00') return 'especialidade'

  return null
}

const catalogByKey = new Map<string, { codigo: string; nome: string }>(
  CNPQ_CATALOG_ROWS.map(([codigo, nome]) => {
    const parsed = parseCode(codigo)
    if (!parsed) throw new Error('Snapshot CNPq contém código inválido.')
    return [toLookupKey(parsed.prefix), { codigo, nome }]
  }),
)

function getAncestorKeys(prefix: ParsedCode['prefix'], level: CnpqLevel): string[] {
  const [grandeArea, area, subarea] = prefix
  const keys = [toLookupKey([grandeArea, '00', '00', '00'])]

  if (level === 'area' || level === 'subarea' || level === 'especialidade') {
    keys.push(toLookupKey([grandeArea, area, '00', '00']))
  }
  if (level === 'subarea' || level === 'especialidade') {
    keys.push(toLookupKey([grandeArea, area, subarea, '00']))
  }
  if (level === 'especialidade') keys.push(toLookupKey(prefix))

  return keys
}

/** Resolve somente códigos existentes no snapshot e preserva sua ancestralidade oficial. */
export function resolveCnpqCatalogEntry(codigo: string): CnpqCatalogEntry | null {
  const parsed = parseCode(codigo)
  if (!parsed) return null

  const level = getLevel(parsed.prefix)
  if (!level) return null

  const entry = catalogByKey.get(toLookupKey(parsed.prefix))
  if (!entry) return null

  const ancestors = getAncestorKeys(parsed.prefix, level)
    .map((key) => catalogByKey.get(key))

  if (ancestors.some((ancestor) => !ancestor)) return null

  return {
    codigo: entry.codigo,
    nome: entry.nome,
    nivel: level,
    caminho_codigos: ancestors.map((ancestor) => ancestor!.codigo),
  }
}

/** Versão estável usada nos progressos persistidos para impedir mistura de catálogos. */
export const CNPQ_CATALOG_VERSION = CNPQ_CATALOG_METADATA.version
