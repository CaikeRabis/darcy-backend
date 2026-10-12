import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let supabaseClient: SupabaseClient | undefined

export function getSupabaseClient(): SupabaseClient {
  if (supabaseClient) return supabaseClient

  const url = process.env.SUPABASE_URL
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY

  if (!url || !publishableKey) {
    throw new Error('Supabase Auth não está configurado.')
  }

  supabaseClient = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })

  return supabaseClient
}
