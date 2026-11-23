import { describe, expect, it } from 'vitest'
import { moimRecBoost, toTimelineMoim } from '@/lib/moim-thread-rules'
import { scoreFeedPost } from '@/lib/recommend-rules'

const NOW = Date.parse('2026-11-23T09:00:00Z')
const day = (d: number) => new Date(NOW + d * 86400_000).toISOString()
const base = {
  id: 'm1', title: '판교 저녁', startsAt: day(2), timeTbd: false, mode: 'offline' as const, venueName: '판교', status: 'open',
  confirmed: 3, capacity: 30, applyDeadline: null, canManage: false, isHost: false, membersOnly: false, isGroupMember: null,
  questions: [] as Array<{ required: boolean }>, myRsvp: null, group: null,
}

describe('A30 모임 card', () => {
  it('one tap joins an open, upcoming 모임 with no required questions', () => {
    expect(toTimelineMoim(base, 2, NOW)).toMatchObject({ canJoin: true, ended: false, invited: 2, confirmed: 3, capacity: 30, groupName: null })
  })
  it('otherwise the card links to the 모임 instead', () => {
    expect(toTimelineMoim({ ...base, questions: [{ required: true }] }, 0, NOW).canJoin).toBe(false)
    expect(toTimelineMoim({ ...base, canManage: true }, 0, NOW).canJoin).toBe(false)
    expect(toTimelineMoim({ ...base, myRsvp: { status: 'confirmed' } }, 0, NOW)).toMatchObject({ canJoin: false, myRsvp: 'confirmed' })
    expect(toTimelineMoim({ ...base, myRsvp: { status: 'cancelled' } }, 0, NOW)).toMatchObject({ canJoin: true, myRsvp: null })
    expect(toTimelineMoim({ ...base, myRsvp: { status: 'rejected' } }, 0, NOW)).toMatchObject({ canJoin: false, myRsvp: 'rejected' })
    expect(toTimelineMoim({ ...base, membersOnly: true, isGroupMember: false }, 0, NOW).canJoin).toBe(false)
    expect(toTimelineMoim({ ...base, status: 'closed' }, 0, NOW).canJoin).toBe(false)
    expect(toTimelineMoim({ ...base, applyDeadline: day(-1) }, 0, NOW).canJoin).toBe(false)
  })
  it('a 모임 that started, is past or cancelled shows 종료 and can\'t be joined', () => {
    expect(toTimelineMoim({ ...base, startsAt: day(-1) }, 0, NOW)).toMatchObject({ ended: true, canJoin: false })
    expect(toTimelineMoim({ ...base, status: 'cancelled' }, 0, NOW)).toMatchObject({ ended: true, cancelled: true })
  })
})

describe('A30 추천 boost', () => {
  it('grows as the day nears; nothing once it ended', () => {
    expect(moimRecBoost({ startsAt: day(2), ended: false }, NOW).boost).toBe(1.5)
    expect(moimRecBoost({ startsAt: day(6), ended: false }, NOW).boost).toBe(1)
    expect(moimRecBoost({ startsAt: day(20), ended: false }, NOW).boost).toBe(0.5)
    expect(moimRecBoost({ startsAt: day(-1), ended: true }, NOW)).toEqual({ boost: 0, maxAgeH: null })
    expect(moimRecBoost(null, NOW).boost).toBe(0)
  })
  const sig = (o: object) => ({ authorId: 'a', realName: true, text: '', toolName: null, likeCount: 0, replyCount: 0, createdAt: day(-5), ...o })
  const ctx = (o: object = {}) => ({ friends: new Set<string>(), following: new Set<string>(), interestTags: [], now: NOW, ...o })
  it('an upcoming 모임 posted days ago still outranks the same plain post', () => {
    const plain = scoreFeedPost(sig({}), ctx())
    const moim = scoreFeedPost(sig({ moim: { startsAt: day(2), ended: false } }), ctx())
    expect(moim.score).toBeGreaterThan(plain.score * 2)
    expect(moim.reason).toEqual({ s: '다가오는 모임' })
  })
  it('friends / following get their own reason; a past 모임 is just a post', () => {
    expect(scoreFeedPost(sig({ moim: { startsAt: day(2), ended: false } }), ctx({ friends: new Set(['a']) })).reason).toEqual({ s: '친구가 연 모임' })
    expect(scoreFeedPost(sig({ moim: { startsAt: day(2), ended: false } }), ctx({ following: new Set(['a']) })).reason).toEqual({ s: '팔로우하는 사람이 연 모임' })
    const past = scoreFeedPost(sig({ moim: { startsAt: day(-1), ended: true } }), ctx())
    expect(past).toEqual(scoreFeedPost(sig({}), ctx()))
  })
})
