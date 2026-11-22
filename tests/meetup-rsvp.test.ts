import { describe, it, expect, beforeEach } from 'vitest'
import {
  approveRsvp,
  cancelOwnRsvp,
  countConfirmed,
  countWaitlisted,
  decideRsvpOnApply,
  promoteFromWaitlist,
} from '@/lib/meetup-rules'
import type { Meetup, MeetupRsvp } from '@/lib/supabase/types'
import { resetMeetupRsvps } from '@/lib/mock-meetups'

const baseMeetup: Meetup = {
  id: 'meetup-test',
  title: '테스트 모임',
  description: 'desc',
  mode: 'offline',
  venue_name: '카페',
  venue_address: null,
  map_url: null,
  meeting_url: null,
  starts_at: '2026-12-20T19:00:00+09:00',
  ends_at: null,
  capacity: 2,
  apply_deadline: '2026-12-19T23:59:00+09:00',
  requires_approval: false,
  fee_note: null,
  host_id: 'member-1',
  posted_as: 'real',
  nickname_profile_id: null,
  status: 'open',
  cancelled_at: null,
  recap_post_id: null,
  recap_photos: null,
  created_at: '2026-11-01T00:00:00Z',
  updated_at: '2026-11-01T00:00:00Z',
}

function rsvp(
  partial: Partial<MeetupRsvp> & Pick<MeetupRsvp, 'id' | 'member_id' | 'status'>
): MeetupRsvp {
  return {
    meetup_id: baseMeetup.id,
    posted_as: 'real',
    nickname_profile_id: null,
    note: null,
    created_at: '2026-11-21T00:00:00Z',
    updated_at: '2026-11-21T00:00:00Z',
    ...partial,
  }
}

describe('모임 RSVP 정원 / 대기열', () => {
  beforeEach(() => {
    resetMeetupRsvps()
  })

  it('정원 내면 confirmed, 초과면 waitlisted', () => {
    const existing = [
      rsvp({ id: 'a', member_id: 'm1', status: 'confirmed' }),
      rsvp({ id: 'b', member_id: 'm2', status: 'confirmed' }),
    ]
    expect(decideRsvpOnApply(baseMeetup, existing)).toBe('waitlisted')
    expect(decideRsvpOnApply(baseMeetup, existing.slice(0, 1))).toBe('confirmed')
  })

  it('승인 필요 모드는 항상 pending', () => {
    const meetup = { ...baseMeetup, requires_approval: true }
    expect(decideRsvpOnApply(meetup, [])).toBe('pending')
  })

  it('취소 시 대기열 1순위가 confirmed로 승격된다', () => {
    const list = [
      rsvp({ id: 'a', member_id: 'm1', status: 'confirmed', created_at: '2026-11-01T00:00:00Z' }),
      rsvp({ id: 'b', member_id: 'm2', status: 'confirmed', created_at: '2026-11-02T00:00:00Z' }),
      rsvp({ id: 'c', member_id: 'm3', status: 'waitlisted', created_at: '2026-11-03T00:00:00Z' }),
      rsvp({ id: 'd', member_id: 'm4', status: 'waitlisted', created_at: '2026-11-04T00:00:00Z' }),
    ]
    const next = cancelOwnRsvp(baseMeetup, list, 'm1')
    expect(countConfirmed(next)).toBe(2)
    expect(next.find((r) => r.member_id === 'm3')?.status).toBe('confirmed')
    expect(next.find((r) => r.member_id === 'm4')?.status).toBe('waitlisted')
    expect(next.find((r) => r.member_id === 'm1')?.status).toBe('cancelled')
  })

  it('호스트 승인은 정원 내에서만 가능', () => {
    const list = [
      rsvp({ id: 'a', member_id: 'm1', status: 'confirmed' }),
      rsvp({ id: 'b', member_id: 'm2', status: 'confirmed' }),
      rsvp({ id: 'c', member_id: 'm3', status: 'pending' }),
    ]
    const full = approveRsvp(baseMeetup, list, 'c')
    expect(full.ok).toBe(false)

    const open = approveRsvp(baseMeetup, list.slice(0, 1).concat(list[2]), 'c')
    expect(open.ok).toBe(true)
    if (open.ok) {
      expect(open.rsvps.find((r) => r.id === 'c')?.status).toBe('confirmed')
    }
  })

  it('promoteFromWaitlist는 FIFO', () => {
    const list = [
      rsvp({ id: 'a', member_id: 'm1', status: 'confirmed' }),
      rsvp({ id: 'c', member_id: 'm3', status: 'waitlisted', created_at: '2026-11-05T00:00:00Z' }),
      rsvp({ id: 'b', member_id: 'm2', status: 'waitlisted', created_at: '2026-11-03T00:00:00Z' }),
    ]
    const { next, rsvps } = promoteFromWaitlist(baseMeetup, list)
    expect(next?.member_id).toBe('m2')
    expect(countWaitlisted(rsvps)).toBe(1)
  })
})
