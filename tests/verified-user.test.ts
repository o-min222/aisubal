import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifiedUser } from '@/lib/supabase/verified-user'

function client(claims: unknown, claimsError: unknown, user: unknown = null) {
  const getUser = vi.fn(async () => ({ data: { user }, error: null }))
  const getClaims = vi.fn(async () => ({ data: claims ? { claims } : null, error: claimsError }))
  return { sb: { auth: { getClaims, getUser } } as unknown as SupabaseClient, getUser, getClaims }
}

describe('verifiedUser', () => {
  it('uses the locally verified token and makes no Auth round trip', async () => {
    const c = client({ sub: 'u1', email: 'a@b.c' }, null)
    expect(await verifiedUser(c.sb)).toEqual({ id: 'u1', email: 'a@b.c' })
    expect(c.getUser).not.toHaveBeenCalled()
  })
  it('signed out: null, still no round trip', async () => {
    const c = client(null, null)
    expect(await verifiedUser(c.sb)).toBeNull()
    expect(c.getUser).not.toHaveBeenCalled()
  })
  it('falls back to getUser when local verification errors', async () => {
    const ok = client(null, new Error('jwks'), { id: 'u2', email: null })
    expect(await verifiedUser(ok.sb)).toEqual({ id: 'u2', email: '' })
    const bad = client(null, new Error('bad signature'), null)
    expect(await verifiedUser(bad.sb)).toBeNull()
  })
})
