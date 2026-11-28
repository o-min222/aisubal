import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canOfferTeaser, teaserExcerpt } from '@/lib/teaser-rules'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'
const sql = readFileSync('supabase/migrations/0106_post_teasers.sql', 'utf8')

// A56: an opt-in outsider preview of a 전체 회원 post. Only the first lines ever leave the database.
describe('A56 blur teaser', () => {
  it('excerpt: first 3 non-empty lines, at most 160 chars, flags the rest', () => {
    expect(teaserExcerpt('a\n\nb\nc\nd SECRET')).toEqual({ excerpt: 'a\nb\nc', more: true })
    expect(teaserExcerpt('짧은 글')).toEqual({ excerpt: '짧은 글', more: false })
    const long = teaserExcerpt('가'.repeat(400))
    expect([...long.excerpt].length).toBe(160)
    expect(long.more).toBe(true)
  })

  it('only own 전체 회원 root posts under the real name', () => {
    const base = { isMine: true, author: { kind: 'member' } }
    expect(canOfferTeaser(base)).toBe(true)
    expect(canOfferTeaser({ ...base, isNickname: true })).toBe(false)
    expect(canOfferTeaser({ ...base, parentId: 'x' })).toBe(false)
    expect(canOfferTeaser({ ...base, groupId: 'g' })).toBe(false)
    expect(canOfferTeaser({ ...base, visibility: 'followers' })).toBe(false)
    expect(canOfferTeaser({ ...base, isMine: false })).toBe(false)
    expect(canOfferTeaser({ ...base, author: { kind: 'agent' } })).toBe(false)
  })

  it('migration: RPC-only table, author-only enable, server-side truncate, anon only reads', () => {
    expect(sql).toContain('revoke all on public.post_teasers from public, anon, authenticated')
    expect(sql).toMatch(/p\.author_id is distinct from v_me then raise exception 'forbidden'/)
    expect(sql).toMatch(/p\.posted_as = 'real'/)
    expect(sql).toMatch(/left\(v_ex, 159\)/)
    expect(sql).toContain('public.teaser_public(text) from public, anon;')
    expect(sql).toContain('grant execute on function public.teaser_public(text) to anon, authenticated;')
    expect(readFileSync('supabase/migrations/0107_teaser_member_link.sql', 'utf8')).toMatch(/case when public\.is_completed_member\(\) then p\.id end/)
    expect(readFileSync('src/middleware.ts', 'utf8')).toMatch(/publicRoutes = \[[^\]]*'\/t'/)
  })

  it('real path (dev): enable → /t/<slug> shows the head, never the tail; bad slug 404', async () => {
    const body = 'TEASER_HEAD 첫 줄\n둘째 줄\n셋째 줄\nTEASER_TAIL 넷째 줄은 보이면 안 돼요'
    const made = await (await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body }) })).json()
    const id = made.post?.id ?? made.id
    const on = await fetch(`${BASE_URL}/api/posts/${id}/teaser`, { method: 'POST' })
    expect(on.status).toBe(201)
    const { slug } = await on.json()
    const html = await (await fetch(`${BASE_URL}/t/${slug}?preview=guest`)).text()
    expect(html).toContain('TEASER_HEAD')
    expect(html).not.toContain('TEASER_TAIL')
    expect((await fetch(`${BASE_URL}/t/zzzzzzzzzzzz`)).status).toBe(404)
    expect((await fetch(`${BASE_URL}/api/posts/${id}/teaser`, { method: 'DELETE' })).status).toBe(200)
    expect((await fetch(`${BASE_URL}/t/${slug}`)).status).toBe(404)
  })
})
