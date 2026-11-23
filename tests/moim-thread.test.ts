import { describe, expect, it } from 'vitest'
import { MAX_INVITES, isMoimThreadBody, moimStartFromInput, moimStartToInput, moimThreadContent, normalizeInvites } from '@/lib/moim-thread-rules'
import { moimInputSchema } from '@/lib/moim-input'
import { toPayload } from '@/lib/data/moim'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'

describe('A29 date + optional time', () => {
  it('a set time is KST wall clock', () => {
    expect(moimStartFromInput('2026-12-03', '19:30')).toEqual({ startsAt: '2026-12-03T19:30:00+09:00', timeTbd: false })
  })
  it('no time = date only, kept upcoming all that day', () => {
    expect(moimStartFromInput('2026-12-03', '')).toEqual({ startsAt: '2026-12-03T23:59:00+09:00', timeTbd: true })
  })
  it('rejects a missing date or a malformed time', () => {
    expect(moimStartFromInput('', '19:00')).toBeNull()
    expect(moimStartFromInput('2026-12-03', '7pm')).toBeNull()
  })
  it('round-trips through the stored ISO (UTC from the DB)', () => {
    expect(moimStartToInput('2026-12-03T10:30:00Z', false)).toEqual({ date: '2026-12-03', time: '19:30' })
    expect(moimStartToInput('2026-12-03T14:59:00Z', true)).toEqual({ date: '2026-12-03', time: '' })
    expect(moimStartToInput(null, false)).toEqual({ date: '', time: '' })
  })
})

describe('A29 invites', () => {
  it('strips @, lowercases, drops non-handles, self and repeats', () => {
    expect(normalizeInvites(['@Kim', 'kim', ' lee_1 ', '한글', 'a', '0mins'], '0MINS')).toEqual(['kim', 'lee_1'])
  })
  it(`caps at ${MAX_INVITES}`, () => {
    expect(normalizeInvites(Array.from({ length: 40 }, (_, i) => `user_${i}`))).toHaveLength(MAX_INVITES)
  })
  it('the API refuses more than the cap', () => {
    const base = { title: '모임', mode: 'offline', startsAt: '2026-12-03T19:30:00+09:00' }
    expect(moimInputSchema.safeParse({ ...base, invites: Array.from({ length: 31 }, (_, i) => `u_${i}`) }).success).toBe(false)
    expect(moimInputSchema.safeParse({ ...base, invites: ['kim'] }).success).toBe(true)
  })
})

describe('A29 minimal input', () => {
  it('title, date and mode are enough (no description, capacity, approval)', () => {
    const r = moimInputSchema.safeParse({ title: '판교 저녁', mode: 'online', startsAt: '2026-12-03T23:59:00+09:00', timeTbd: true })
    expect(r.success).toBe(true)
  })
  it('fields the form does not send are not sent to the DB (edit keeps them)', () => {
    const p = toPayload({ title: '판교 저녁', mode: 'offline', venueName: '판교', startsAt: '2026-12-03T19:30:00+09:00', timeTbd: false, description: '' })
    expect(p).toMatchObject({ title: '판교 저녁', venue_name: '판교', time_tbd: false, description: '' })
    // a caller that doesn't know about time_tbd (older client) must not reset it
    expect(toPayload({ title: 'x', mode: 'online', startsAt: 'x' })).not.toHaveProperty('time_tbd')
    for (const k of ['capacity', 'requires_approval', 'ends_at', 'apply_deadline', 'venue_address', 'map_url', 'meeting_url', 'fee_note', 'questions']) expect(p).not.toHaveProperty(k)
  })
  it('an explicit empty value is still sent (clears it)', () => {
    expect(toPayload({ title: 'x', mode: 'online', startsAt: 'x', meetingUrl: null, endsAt: '' })).toMatchObject({ meeting_url: '', ends_at: '' })
  })
})

describe('A29 thread post', () => {
  const m = { title: '판교 저녁', startsAt: '2026-12-03T10:30:00Z', timeTbd: false, mode: 'offline' as const, venueName: '판교역', description: '' }
  it('matches moim__thread_content: what / when / where, then the comments line', () => {
    expect(moimThreadContent(m)).toBe('[모임] 판교 저녁\n📅 2026. 12. 3. 19:30 · 오프라인 · 판교역\n\n자세한 이야기는 댓글로 나눠요.')
  })
  it('date only, online, with a one-liner', () => {
    expect(moimThreadContent({ ...m, timeTbd: true, mode: 'online', venueName: '판교역', description: ' 가볍게 ' })).toBe('[모임] 판교 저녁\n📅 2026. 12. 3. · 온라인\n\n가볍게\n\n자세한 이야기는 댓글로 나눠요.')
  })
  it('only thread posts trigger the 모임 lookup', () => {
    expect(isMoimThreadBody(moimThreadContent(m))).toBe(true)
    expect(isMoimThreadBody('모임 어때요')).toBe(false)
  })
})

describe('A29 notification', () => {
  it('moim_invite has its own sentence (not the unknown-kind fallback)', () => {
    const n = { id: '1', kind: 'moim_invite', category: 'social', link: '/moim/x', excerpt: '판교 저녁', targetKind: 'moim', count: 1, createdAt: '', unread: true, actor: { kind: 'member', id: 'm', name: '민수', avatarUrl: null } } satisfies NotificationItem
    expect(notificationSentence(n)).toEqual({ s: '{name}님이 나를 모임에 초대했어요', name: '민수', n: 0 })
  })
})
