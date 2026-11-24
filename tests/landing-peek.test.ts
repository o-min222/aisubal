import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parsePeek, PEEK_MAX } from '@/lib/landing-peek-rules'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const sql = readFileSync('supabase/migrations/0113_landing_peek.sql', 'utf8')

describe('A64 landing peek', () => {
  it('keeps only the teaser fields, at most 5', () => {
    const got = parsePeek([
      { line: 'a line', reactions: 3, comments: 1, days: 2, id: 'x', author: 'leak', body: 'leak' },
      { line: '', reactions: 1 },
      ...Array.from({ length: 8 }, (_, i) => ({ line: `l${i}`, reactions: -1, comments: 'x', days: 1.7 })),
    ])
    expect(got.length).toBe(PEEK_MAX)
    expect(got[0]).toEqual({ line: 'a line', reactions: 3, comments: 1, days: 2 })
    expect(got[1]).toEqual({ line: 'l0', reactions: 0, comments: 0, days: 1 })
    expect(parsePeek(null)).toEqual([])
  })
  it('0113: who qualifies', () => {
    for (const rule of [
      "p.visibility = 'members'", 'p.group_id is null', "p.posted_as = 'real'", 'p.image_path is null', 'p.deleted_at is null',
      'not coalesce(p.is_hidden, false)', 'm.public_peek', 'not m.is_banned', 'not public.peek__has_pii(', 'p.agent_token_id is null',
    ]) expect(sql).toContain(rule)
    expect(sql).toMatch(/limit 5/)
    expect(sql).toMatch(/'landing_peek'\), 'true'\) = 'false'/)
  })
  it('0113: only the peek RPC is open to anon; links and @mentions are stripped; ≤ 60 chars', () => {
    expect(sql).toMatch(/grant execute on function public\.landing_peek\(\) to anon, authenticated;/)
    expect(sql).toMatch(/revoke all on function public\.peek__has_pii\(text\) from public, anon, authenticated;/)
    expect(sql).toMatch(/revoke all on function public\.peek__line\(public\.posts\) from public, anon, authenticated;/)
    expect(sql).toMatch(/revoke all on function public\.peek_pref_get\(\), public\.peek_pref_set\(boolean\) from public, anon;/)
    expect(sql).not.toMatch(/grant execute on function public\.peek_pref_[a-z]+\([^)]*\)[^;]*anon/)
    expect(sql).toContain("'(https?://|www\\.)\\S+'")
    expect(sql).toContain("left(v, 59) || '…'")
    expect(sql).not.toMatch(/jsonb_build_object\([^)]*'(id|author|content|body)'/)
  })
})

describe('A64 real path (dev)', () => {
  it('landing shows the peek with the lock line and a /join CTA; the toggle round-trips', async () => {
    const html = await (await fetch(`${BASE_URL}/?preview=1`, { headers: { cookie: 'aisubal_locale=ko' } })).text()
    expect(html).toContain('초대장이 있어야 볼 수 있어요')
    expect(html).toContain('/join?from=landing')
    expect((html.match(/class="peek-item"/g) ?? []).length).toBeGreaterThan(0)
    const off = await fetch(`${BASE_URL}/api/me/peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: false }) })
    expect((await off.json()).on).toBe(false)
    expect((await (await fetch(`${BASE_URL}/api/me/peek`)).json()).on).toBe(false)
    const on = await fetch(`${BASE_URL}/api/me/peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: true }) })
    expect((await on.json()).on).toBe(true)
    expect((await fetch(`${BASE_URL}/api/me/peek`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"on":"x"}' })).status).toBe(400)
  })
})

describe('A65 landing layout (dev)', () => {
  const page = async () => (await fetch(`${BASE_URL}/?preview=1`, { headers: { cookie: 'aisubal_locale=ko' } })).text()
  const admin = (landingPeek: boolean) => fetch(`${BASE_URL}/api/admin/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ landingPeek }) })
  it('peek first, then the login section with the same /login entry; the cue jumps to it', async () => {
    const html = await page()
    const peekAt = html.indexOf('class="landing-peek"')
    const loginAt = html.indexOf('id="login"')
    expect(peekAt).toBeGreaterThan(-1)
    expect(loginAt).toBeGreaterThan(peekAt)
    expect(html).toContain('href="#login"')
    expect(html.slice(loginAt)).toContain('href="/login"')
    expect(html).toContain('/join?from=landing')
  })
  it('kill switch off → the plain login screen, no empty first screen', async () => {
    expect((await admin(false)).status).toBe(200)
    try {
      await page() // a plain API call refreshes behind one stale view; the settings form uses updateTag for an instant switch
      const html = await page()
      expect(html).not.toContain('class="landing')
      expect(html).toContain('auth-hero')
      expect(html).toContain('href="/login"')
    } finally {
      await admin(true)
    }
  })
})
