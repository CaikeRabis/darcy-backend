import { z } from 'zod'
import { prisma } from '../lib/prisma'

const profileInputSchema = z.object({
  fullName: z.string().trim().min(3).max(120),
  phone: z.string().trim().refine((value) => {
    const digits = value.replace(/\D/g, '')
    return /^(?:55)?\d{10,11}$/.test(digits)
  }, 'Telefone celular inválido.'),
}).partial()

export interface ProfileData {
  fullName?: string
  phone?: string
}

export interface ProfileView {
  fullName: string | null
  phone: string | null
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.startsWith('55') ? `+${digits}` : `+55${digits}`
}

export function parseProfileInput(value: unknown): ProfileData {
  const parsed = profileInputSchema.parse(value)
  const data: ProfileData = {}

  if (parsed.fullName !== undefined) data.fullName = parsed.fullName
  if (parsed.phone !== undefined) data.phone = normalizePhone(parsed.phone)

  if (!data.fullName && !data.phone) {
    throw new Error('Informe nome completo ou telefone.')
  }

  return data
}

function metadataSeed(metadata: Record<string, unknown> | undefined): ProfileData {
  const fullName = typeof metadata?.full_name === 'string' ? metadata.full_name.trim() : undefined
  const phone = typeof metadata?.phone === 'string' ? metadata.phone.trim() : undefined

  try {
    return parseProfileInput({ fullName, phone })
  } catch {
    return {}
  }
}

/**
 * Garante o registro correspondente à identidade validada pelo Supabase.
 * Metadados só podem preencher campos vazios; nunca concedem privilégios.
 */
export async function ensureProfile(
  authUserId: string,
  metadata?: Record<string, unknown>,
): Promise<ProfileView> {
  const seed = metadataSeed(metadata)
  await prisma.profile.upsert({
    where: { id: authUserId },
    update: {},
    create: { id: authUserId, ...seed },
  })

  if (seed.fullName) {
    await prisma.profile.updateMany({
      where: { id: authUserId, fullName: null },
      data: { fullName: seed.fullName },
    })
  }
  if (seed.phone) {
    await prisma.profile.updateMany({
      where: { id: authUserId, phone: null },
      data: { phone: seed.phone },
    })
  }

  return prisma.profile.findUniqueOrThrow({
    where: { id: authUserId },
    select: { fullName: true, phone: true },
  })
}

export async function updateOwnProfile(authUserId: string, data: ProfileData): Promise<ProfileView> {
  await ensureProfile(authUserId)
  return prisma.profile.update({
    where: { id: authUserId },
    data,
    select: { fullName: true, phone: true },
  })
}
