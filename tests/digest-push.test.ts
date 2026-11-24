import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { pushPayload, type PushJob } from '@/lib/push-rules'
import { makeT } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'
import { DEFAULT_PREFS, NOTIFY_CATEGORIES } from '@/lib/notifications'
import { shouldPingSeen, SEEN_EVERY_MS } from '@/lib/digest-rules'

const job = (kind: string, extra: Record<string, unknown> = {}): PushJob => ({
  outboxId: 1, subscriptionId: 's', endpoint: 'e', p256dh: 'p', auth: 'a', locale: 'ko', unread: 0,
  item: { id: 'n1', kind, category: 'digest', link: '/feed', excerpt: null, targetKind: null, count: 1, createdAt: new Date().toISOString(),
    unread: true, actor: { kind: 'someone', id: null, name: null, avatarUrl: null }, ...extra } as unknown as PushJob['item'],
})

describe('A61 daily 새 소식 push', () => {
  it('has its own category, on by default, daily by default', () => {
    expect(NOTIFY_CATEGORIES.some((c) => c.id === 'digest')).toBe(true)
    expect(DEFAULT_PREFS.digest).toBe(true)
    expect(DEFAULT_PREFS.digest_weekly).toBe(false)
  })
  it('writes one sentence per variant, ko and en, opening the right place', () => {
    const ko = makeT('ko', null), en = makeT('en', DICTS.en)
    const nw = pushPayload(job('digest', { count: 3, excerpt: '제목' }), ko)
    expect(nw.body).toContain('3'); expect(nw.body).toContain('제목'); expect(nw.url).toBe('/feed')
    const pick = pushPayload(job('digest_pick', { link: '/posts/abc', excerpt: '인기 글' }), en)
    expect(pick.body).toMatch(/^A popular post you may have missed\n인기 글/); expect(pick.url).toBe('/posts/abc')
    const nudge = pushPayload(job('digest_nudge'), en)
    expect(nudge.body).toBe('Drop by AI쓰발 today'); expect(nudge.url).toBe('/feed')
  })
  it('pings seen at most every 10 minutes', () => {
    expect(shouldPingSeen(null, 0)).toBe(true)
    expect(shouldPingSeen(0, SEEN_EVERY_MS - 1)).toBe(false)
    expect(shouldPingSeen(0, SEEN_EVERY_MS)).toBe(true)
  })
  it('0111: every opted-in member, once a day, quiet hours, fallbacks, no extra push', () => {
    const sql = readFileSync('supabase/migrations/0111_digest_daily_all.sql', 'utf8')
    expect(sql).toMatch(/v_hour < 8 or v_hour > 21/)
    expect(sql).toMatch(/'digest:' \|\| to_char\(v_kst, 'YYYY-MM-DD'\)/)
    expect(sql).not.toMatch(/last_seen_at > /)          // no "visited recently" skip
    expect(sql).not.toMatch(/insert into public\.notifications[\s\S]*'digest_hot'/) // no second push
    for (const k of ["'digest_pick'", "'digest_nudge'"]) expect(sql).toContain(k)
    expect(sql).toMatch(/revoke all on function public\.digest__run\(timestamptz\), public\.digest__fresh_for\(public\.posts, uuid\) from public, anon, authenticated/)
  })
})
