import type { Meetup, MeetupRsvp, MeetupRsvpStatus } from '@/lib/supabase/types'

export function countConfirmed(rsvps: MeetupRsvp[]): number {
  return rsvps.filter((r) => r.status === 'confirmed').length
}

export function countWaitlisted(rsvps: MeetupRsvp[]): number {
  return rsvps.filter((r) => r.status === 'waitlisted').length
}

export function isPastMeetup(meetup: Meetup, now = new Date()): boolean {
  if (meetup.status === 'past' || meetup.status === 'cancelled') return true
  return new Date(meetup.starts_at) < now
}

export function isApplyOpen(meetup: Meetup, now = new Date()): boolean {
  if (meetup.status === 'cancelled' || meetup.status === 'closed' || meetup.status === 'past') {
    return false
  }
  if (meetup.apply_deadline && new Date(meetup.apply_deadline) < now) return false
  if (new Date(meetup.starts_at) < now) return false
  return true
}

export function canSeeMeetingUrl(
  meetup: Meetup,
  rsvp: MeetupRsvp | null | undefined,
  isHost: boolean
): boolean {
  if (meetup.mode !== 'online') return false
  if (isHost) return true
  return rsvp?.status === 'confirmed'
}

/**
 * Decide initial RSVP status when a member applies.
 * - If approval required → pending
 * - Else if capacity remaining → confirmed
 * - Else → waitlisted
 */
export function decideRsvpOnApply(
  meetup: Meetup,
  existingRsvps: MeetupRsvp[]
): MeetupRsvpStatus {
  if (meetup.requires_approval) return 'pending'
  if (countConfirmed(existingRsvps) < meetup.capacity) return 'confirmed'
  return 'waitlisted'
}

export function promoteFromWaitlist(
  meetup: Meetup,
  rsvps: MeetupRsvp[]
): { next: MeetupRsvp | null; rsvps: MeetupRsvp[] } {
  if (countConfirmed(rsvps) >= meetup.capacity) {
    return { next: null, rsvps }
  }
  const waitlisted = rsvps
    .filter((r) => r.status === 'waitlisted')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const next = waitlisted[0]
  if (!next) return { next: null, rsvps }
  const updated = rsvps.map((r) =>
    r.id === next.id
      ? { ...r, status: 'confirmed' as const, updated_at: new Date().toISOString() }
      : r
  )
  return { next: { ...next, status: 'confirmed' }, rsvps: updated }
}

export function approveRsvp(
  meetup: Meetup,
  rsvps: MeetupRsvp[],
  rsvpId: string
): { ok: true; rsvps: MeetupRsvp[] } | { ok: false; reason: string } {
  const target = rsvps.find((r) => r.id === rsvpId)
  if (!target) return { ok: false, reason: '신청을 찾을 수 없습니다.' }
  if (target.status !== 'pending' && target.status !== 'waitlisted') {
    return { ok: false, reason: '승인할 수 없는 상태입니다.' }
  }
  if (countConfirmed(rsvps) >= meetup.capacity) {
    return { ok: false, reason: '정원이 가득 찼습니다. 대기열로 두거나 정원을 늘리세요.' }
  }
  return {
    ok: true,
    rsvps: rsvps.map((r) =>
      r.id === rsvpId
        ? { ...r, status: 'confirmed' as const, updated_at: new Date().toISOString() }
        : r
    ),
  }
}

export function rejectRsvp(
  rsvps: MeetupRsvp[],
  rsvpId: string
): MeetupRsvp[] {
  return rsvps.map((r) =>
    r.id === rsvpId
      ? { ...r, status: 'rejected' as const, updated_at: new Date().toISOString() }
      : r
  )
}

export function cancelOwnRsvp(
  meetup: Meetup,
  rsvps: MeetupRsvp[],
  memberId: string
): MeetupRsvp[] {
  let next = rsvps.map((r) =>
    r.member_id === memberId && (r.status === 'confirmed' || r.status === 'waitlisted' || r.status === 'pending')
      ? { ...r, status: 'cancelled' as const, updated_at: new Date().toISOString() }
      : r
  )
  // Free a seat → promote waitlist
  const promoted = promoteFromWaitlist(meetup, next)
  return promoted.rsvps
}
