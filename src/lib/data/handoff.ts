import { sb, useMockData as isMock } from './client'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { HANDOFF_TTL_MS, hashHandoffToken, newHandoffToken } from '@/lib/handoff-rules'

/** Desktop → phone setup handoff (0072). Never log a token: it is a sign-in credential for 10 minutes. */
export type HandoffStatus = 'pending' | 'completed' | 'expired'
export type RedeemResult = 'ok' | 'invalid' | 'wrong_member' | 'needs_login'

type MockHandoff = { id: string; hash: string; memberId: string; expiresAt: number; usedAt: number | null; createdAt: number }
// on globalThis: route handlers and server components get separate module instances in dev
const g = globalThis as { __handoffMock?: Map<string, MockHandoff> }
const mock = (g.__handoffMock ??= new Map<string, MockHandoff>())

export class HandoffRateLimited extends Error {}

export async function createHandoff(memberId: string): Promise<{ id: string; token: string; expiresAt: string }> {
  const token = newHandoffToken()
  const hash = await hashHandoffToken(token)
  if (isMock()) {
    const recent = [...mock.values()].filter((h) => h.memberId === memberId && h.createdAt > Date.now() - HANDOFF_TTL_MS)
    if (recent.length >= 5) throw new HandoffRateLimited()
    const h = { id: crypto.randomUUID(), hash, memberId, createdAt: Date.now(), expiresAt: Date.now() + HANDOFF_TTL_MS, usedAt: null }
    mock.set(h.id, h)
    return { id: h.id, token, expiresAt: new Date(h.expiresAt).toISOString() }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('handoff_create', { p_token_hash: hash })
  if (error) throw /rate_limited/.test(error.message) ? new HandoffRateLimited() : new Error('handoff_create failed')
  const d = data as { id: string; expiresAt: string }
  return { id: d.id, token, expiresAt: d.expiresAt }
}

export async function handoffStatus(memberId: string, id: string): Promise<HandoffStatus | null> {
  if (isMock()) {
    const h = mock.get(id)
    if (!h || h.memberId !== memberId) return null
    return h.usedAt ? 'completed' : h.expiresAt <= Date.now() ? 'expired' : 'pending'
  }
  const supabase = await sb()
  const { data } = await supabase.rpc('handoff_status', { p_id: id })
  return (data as HandoffStatus | null) ?? null
}

/** The phone is already signed in: completes only if it is the same member. */
export async function redeemHandoff(memberId: string, token: string): Promise<RedeemResult> {
  const hash = await hashHandoffToken(token)
  if (isMock()) {
    const h = [...mock.values()].find((x) => x.hash === hash)
    if (!h || h.usedAt || h.expiresAt <= Date.now()) return 'invalid'
    if (h.memberId !== memberId) return 'wrong_member'
    h.usedAt = Date.now()
    return 'ok'
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('handoff_redeem', { p_token_hash: hash })
  if (error) return 'invalid'
  return data as RedeemResult
}

/** One-tap sign-in on the phone needs the service role (to mint that member's session). */
export function canMintSessions(): boolean {
  return !isMock() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
}

/**
 * Signed-out phone: consume the handoff, then sign the same member in with Supabase's own
 * magic-link verification (generateLink sends no email; the hashed token never leaves the server).
 */
export async function mintHandoffSession(token: string): Promise<RedeemResult> {
  if (!canMintSessions()) return 'needs_login'
  const admin = createServiceClient()
  const { data: authId } = await admin.rpc('handoff_consume', { p_token_hash: await hashHandoffToken(token) })
  if (!authId) return 'invalid'
  const { data: u } = await admin.auth.admin.getUserById(authId as string)
  const email = u?.user?.email
  if (!email) return 'invalid'
  const { data: link, error } = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  const tokenHash = link?.properties?.hashed_token
  if (error || !tokenHash) return 'invalid'
  const supabase = await createClient()
  const { error: vErr } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash })
  return vErr ? 'invalid' : 'ok'
}
