import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { joinEmailError, joinSource } from '@/lib/join-rules'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'
const sql = readFileSync('supabase/migrations/0108_public_waitlist.sql', 'utf8')

// A57: a public waitlist for people with no invite (the teaser CTA lands here).
describe('A57 public waitlist', () => {
  it('rules: email shape, source whitelist', () => {
    expect(joinEmailError('')).not.toBeNull()
    expect(joinEmailError('nope')).not.toBeNull()
    expect(joinEmailError(' a@b.co ')).toBeNull()
    expect(joinSource('teaser')).toBe('teaser')
    expect(joinSource('DROP TABLE')).toBeNull()
  })

  it('migration: RPC-only insert, deduped by lower(email), rate-limited, admin-only invite with a batch-0 code', () => {
    expect(sql).toContain('revoke all on public.public_waitlist from public, anon, authenticated')
    expect(sql).toContain('public_waitlist_email_key on public.public_waitlist (lower(email))')
    expect(sql).toContain('on conflict (lower(email)) do nothing')
    expect(sql).toMatch(/interval '1 hour'\) >= 5 then/)
    expect(sql).toMatch(/values \(v_code, v_me, 0, 'waitlist'\)/)
    expect(sql).toContain('grant execute on function public.waitlist_join(text, text, text, text, text), public.waitlist_count() to anon, authenticated')
    expect(readFileSync('src/middleware.ts', 'utf8')).toMatch(/publicRoutes = \[[^\]]*'\/join'/)
    expect(readFileSync('src/app/t/[slug]/page.tsx', 'utf8')).toContain('href="/join?from=teaser"')
  })

  it('real path (dev): sign up twice → same answer; bad email 400; honeypot accepted silently; count served', async () => {
    const post = (b: object) => fetch(`${BASE_URL}/api/join`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    const a = await post({ email: 'Test-Join@Example.com', reason: '궁금해요' })
    expect(a.status).toBe(201)
    const n1 = (await a.json()).waiting
    const b = await post({ email: 'test-join@example.com' })
    expect(b.status).toBe(201)
    expect((await b.json()).waiting).toBe(n1)
    expect((await post({ email: 'bad' })).status).toBe(400)
    expect((await post({ email: 'bot@example.com', website: 'x' })).status).toBe(201)
    const c = await (await fetch(`${BASE_URL}/api/join`)).json()
    expect(c.waiting).toBe(n1)
  })
})
