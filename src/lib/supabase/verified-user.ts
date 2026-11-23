import type { SupabaseClient } from '@supabase/supabase-js'

export type VerifiedUser = { id: string; email: string }

/**
 * Who is signed in, without a Supabase Auth round trip when possible.
 * getClaims() refreshes an expired session, then verifies the access token locally against the
 * project's ES256 public key (JWKS cached per server instance). That replaced two sequential
 * ~115 ms /auth/v1/user calls (middleware + layout) on every page view, prefetch and API call.
 * If local verification errors for any reason, fall back to getUser() so this is never worse than before.
 */
export async function verifiedUser(supabase: SupabaseClient): Promise<VerifiedUser | null> {
  const { data, error } = await supabase.auth.getClaims()
  if (!error) {
    const c = data?.claims
    return c?.sub ? { id: c.sub, email: typeof c.email === 'string' ? c.email : '' } : null
  }
  const { data: u } = await supabase.auth.getUser()
  return u.user ? { id: u.user.id, email: u.user.email ?? '' } : null
}
