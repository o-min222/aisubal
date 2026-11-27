import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyBlock, interestBlock, decideOnApply, type MoimRsvp } from '@/lib/moim-rules'
import { buildIcs, googleCalendarUrl, type MineMeetup } from '@/lib/moim-calendar'
import { notificationSentence } from '@/lib/notifications'
import { listTools } from '@/lib/mcp/registry'
import type { NotificationItem } from '@/lib/notifications'

const read = (p: string) => readFileSync(p, 'utf8')
const sql = read('supabase/migrations/0147_moim_interest_and_hour_remind.sql')

const baseMoim = {
  status: 'open' as const,
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  applyDeadline: null as string | null,
  isHost: false,
  membersOnly: false,
  groupId: null as string | null,
}

describe('A125 관심 RSVP', () => {
  it('does not take a seat and is blocked for hosts, closed meetups, and existing applications', () => {
    const rsvps: MoimRsvp[] = [
      { id: '1', memberId: 'a', status: 'interested', answers: {}, note: null, createdAt: '', waitlistedAt: null, decidedAt: null },
      { id: '2', memberId: 'b', status: 'confirmed', answers: {}, note: null, createdAt: '', waitlistedAt: null, decidedAt: null },
    ]
    expect(decideOnApply({ requiresApproval: false, capacity: 2 }, rsvps)).toBe('confirmed')
    expect(interestBlock(baseMoim, { isGroupMember: true, myStatus: null })).toBeNull()
    expect(interestBlock(baseMoim, { isGroupMember: true, myStatus: 'confirmed' })).toBe('moim_already_applied')
    expect(interestBlock({ ...baseMoim, isHost: true }, { isGroupMember: true, myStatus: null })).toBe('moim_host_cannot_apply')
    expect(applyBlock(baseMoim, { isGroupMember: true, myStatus: 'interested' })).toBeNull()
  })

  it('interested events go into the ICS feed as TENTATIVE, without a private place, and keep UID + SEQUENCE', () => {
    const ev: MineMeetup = {
      id: 'moim-1',
      title: '판교 모임',
      startsAt: '2026-12-01T10:00:00.000Z',
      endsAt: '2026-12-01T13:00:00.000Z',
      timeTbd: false,
      mode: 'offline',
      venueName: '판교역 인근',
      meetupStatus: 'open',
      my: 'interested',
      url: '/moim/moim-1',
      sequence: 2,
      private: { venueAddress: 'secret street', mapUrl: null, meetingUrl: null },
    }
    const ics = buildIcs([ev], { origin: 'https://aisubal.vercel.app', lang: 'ko', now: new Date('2026-11-28T00:00:00Z') })
    expect(ics).toContain('UID:moim-1@aisubal')
    expect(ics).toContain('SEQUENCE:2')
    expect(ics).toContain('STATUS:TENTATIVE')
    expect(ics).toContain('SUMMARY:판교 모임 (관심)')
    expect(ics).toContain('LOCATION:판교역 인근')
    expect(ics).not.toContain('secret street')
    expect(googleCalendarUrl(ev, 'https://aisubal.vercel.app', 'ko')).toContain('calendar.google.com/calendar/render')
  })
})

describe('A125 hour-before reminder and existing calendar surface', () => {
  it('migration adds interested, an hour-before reminder, and does not log the feed token', () => {
    expect(sql).toMatch(/'interested'/)
    expect(sql).toMatch(/moim_hour/)
    expect(sql).toMatch(/moim_reminder:' \|\| r.id \|\| ':h1'/)
    expect(sql).toMatch(/interval '45 minutes'/)
    expect(sql).toMatch(/interval '75 minutes'/)
    expect(sql).toContain('create or replace function public.moim_interest')
    expect(sql).not.toMatch(/raise (notice|log|info|warning).*p_token|token/i)
    const feed = read('src/app/api/calendar/[token]/route.ts')
    expect(feed).not.toMatch(/console\.(log|info|debug|warn)/)
  })

  it('bell copy exists; meetup_list / meetup_get stay the agent read tools and are annotated', () => {
    const n = (kind: NotificationItem['kind']) =>
      notificationSentence({ id: '1', kind, category: 'meetups', link: '/moim/1', excerpt: 't', targetKind: 'moim', count: 1, createdAt: '', unread: true, actor: null }).s
    expect(n('moim_hour')).toBe('한 시간 뒤 모임이 시작돼요')
    const names = listTools().map((t) => t.name)
    expect(names).toContain('meetup_list')
    expect(names).toContain('meetup_get')
    expect(names).not.toContain('event_list')
    const list = listTools().find((t) => t.name === 'meetup_list')
    expect(list?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false })
    expect(list?.outputSchema).toEqual({ type: 'object', additionalProperties: true })
  })
})
