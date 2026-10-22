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


import { prisma } from './prisma'

/** Consulta mínima para verificar disponibilidade do banco sem tocar dados de domínio. */
export async function verifyDatabaseReadiness(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}
