import { createClient } from '@supabase/supabase-js'

/**
 * Session-less anon client for token-authenticated agent calls (MCP/CLI).
 * Authorization happens inside SECURITY DEFINER RPCs that verify the raw
 * agent token; no service-role key is used.
 */
export function createAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}
