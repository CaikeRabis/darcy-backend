import { prisma } from './prisma'

/** Consulta mínima para verificar disponibilidade do banco sem tocar dados de domínio. */
export async function verifyDatabaseReadiness(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`
}
