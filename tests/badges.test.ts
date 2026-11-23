import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BADGES, badgeTierLabel, parseBadgeKey, sortBadges, type MemberBadge } from '@/lib/badges'
import { notificationSentence, NOTIFY_CATEGORIES, DEFAULT_PREFS, type NotificationItem } from '@/lib/notifications'
import { pushPayload, type PushJob } from '@/lib/push-rules'
import { makeT } from '@/i18n/translate'
import { DICTS } from '@/i18n/dict'

const sql = readFileSync('supabase/migrations/0078_badges.sql', 'utf8')
/** 0085 re-creates the tiers and the allowed list with 'invite_king' */
const latest = readFileSync('supabase/migrations/0089_member_titles.sql', 'utf8')

describe('E1 contribution badges', () => {
  it('names exactly the badges and thresholds the database awards', () => {
    const tiers = JSON.parse(latest.match(/select '(\{"first_post"[^']+)'::jsonb/)![1]) as Record<string, number[]>
    expect(Object.fromEntries(BADGES.map((b) => [b.id, [...b.tiers]]))).toEqual(tiers)
    const allowed = latest.match(/badge in \(([^)]+)\)/)![1].split(',').map((s) => s.trim().replace(/'/g, ''))
    expect(BADGES.map((b) => b.id).sort()).toEqual(allowed.sort())
    for (const b of BADGES) expect(b.labels).toHaveLength(b.tiers.length)
  })

  it('counts only real-name, top-level member posts (a 부캐 never earns a badge on the real profile)', () => {
    expect(sql).toMatch(/p\.posted_as = 'real' and p\.author_kind = 'member' and p\.as_group_id is null/)
    expect(sql).toMatch(/if new\.posted_as <> 'real' or new\.author_kind <> 'member'/)
  })

  it('is idempotent and quiet on backfill: tiers only go up, dedupe per tier, backfill without notifications', () => {
    expect(sql).toMatch(/elsif v_tier > v_old then/)
    expect(sql).toMatch(/'badge:' \|\| r\.badge \|\| ':' \|\| v_tier/)
    expect(sql).toMatch(/perform public\.badges__award\(m\.id, false\)/)
    expect(sql).toMatch(/exception when others then return null;/)
  })

  it('reads the notification key back into one translatable sentence, in the bell and in push', () => {
    expect(parseBadgeKey('reviewer:2')).toEqual({ id: 'reviewer', tier: 2 })
    expect(parseBadgeKey('reviewer:9')).toEqual({ id: 'reviewer', tier: 3 })
    expect(parseBadgeKey('nope:1')).toBeNull()
    const n: NotificationItem = { id: 'n', kind: 'badge', category: 'badges', link: '/members/me?badges=liked', excerpt: null, targetKind: 'member', count: 1, createdAt: '', unread: true, actor: { kind: 'someone', id: null, name: 'liked:2', avatarUrl: null } }
    expect(notificationSentence(n)).toMatchObject({ s: '‘{name}’ 배지를 받았어요', name: '좋아요 20개 받은 글', nameIsLabel: true })
    const job = { outboxId: 1, subscriptionId: 's', endpoint: 'https://x', p256dh: 'p', auth: 'a', locale: 'en', unread: 1, item: n } as unknown as PushJob
    expect(pushPayload(job, makeT('en', DICTS.en)).body).toBe('You earned the ‘Post with 20 likes’ badge')
    expect(pushPayload({ ...job, locale: 'ko' }, makeT('ko', DICTS.ko)).body).toBe('‘좋아요 20개 받은 글’ 배지를 받았어요')
    expect(pushPayload(job, makeT('en', DICTS.en)).url).toBe('/members/me?badges=liked')
  })

  it('has its own notification toggle, on by default, matching the database prefs', () => {
    expect(NOTIFY_CATEGORIES.map((c) => c.id)).toContain('badges')
    expect(DEFAULT_PREFS.badges).toBe(true)
    expect(sql).toMatch(/p_key not in \([^)]*'badges'\)/)
  })

  it('shows badges in catalog order with a clamped tier label', () => {
    const b = (badge: MemberBadge['badge']): MemberBadge => ({ badge, tier: 1, value: 1, awardedAt: '', updatedAt: '' })
    expect(sortBadges([b('agent'), b('founder'), b('liked')]).map((x) => x.badge)).toEqual(['founder', 'liked', 'agent'])
    expect(badgeTierLabel('streak', 7)).toBe('30일 연속 출석')
    for (const d of BADGES) for (const l of [...d.labels, d.how]) expect(DICTS.en![l as keyof typeof DICTS.en], l).toBeTruthy()
  })
})
