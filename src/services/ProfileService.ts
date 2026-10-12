import { prisma } from '../lib/prisma'

/**
 * Garante o registro de domínio correspondente a uma identidade já validada
 * pelo Supabase Auth. O id é sempre o UUID de auth.users, nunca um valor do
 * corpo ou dos parâmetros de uma requisição.
 */
export async function ensureProfile(authUserId: string): Promise<void> {
  await prisma.profile.upsert({
    where: { id: authUserId },
    update: {},
    create: { id: authUserId },
  })
}
