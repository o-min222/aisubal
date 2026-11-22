import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'

describe('토큰 재발급 (0061)', () => {
  it('returns a fresh token once, without caching', async () => {
    const res = await fetch(`${BASE_URL}/api/tokens/token-1/rotate`, { method: 'POST' })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const d = await res.json()
    expect(d.token).toMatch(/^aisubal_[0-9a-f]{48}$/)
  })
  it('the migration swaps the secret in place (same row), audits, rate limits and lets admins force', () => {
    const sql = readFileSync('supabase/migrations/0061_token_rotate.sql', 'utf8')
    expect(sql).toMatch(/UPDATE public\.api_tokens\s+SET token_hash = p_hash/)
    expect(sql).toContain('INSERT INTO public.api_token_rotations')
    expect(sql).toContain('rotate_rate_limited')
    expect(sql).toMatch(/v_forced AND NOT coalesce\(v_admin, false\)/)
  })
})
