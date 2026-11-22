import {
  getMeetupAnnouncements as mockGetAnnouncements,
  getMeetupDetails as mockGetDetails,
  listMeetupsDetailed as mockListDetailed,
  upcomingMeetups as mockUpcoming,
  MOCK_MEETUPS,
  MUTABLE_RSVPS,
} from '@/lib/mock-meetups'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import {
  approveRsvp,
  cancelOwnRsvp,
  countConfirmed,
  countWaitlisted,
  decideRsvpOnApply,
  isApplyOpen,
} from '@/lib/meetup-rules'
import { nicknameProfilePublicId, toPublicAuthor } from '@/lib/profile'
import type {
  Member,
  Meetup,
  MeetupAnnouncement,
  MeetupRsvp,
  PostAs,
} from '@/lib/supabase/types'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'
import { sb, useMockData } from './client'
import type { MeetupWithDetails } from './types'

export type { MeetupWithDetails } from './types'

/** Dev-only announcements appended at runtime (mirrors prior API EXTRA buffer). */
const EXTRA_ANNOUNCEMENTS: MeetupAnnouncement[] = []

type CreateMeetupInput = {
  title: string
  description: string
  mode: Meetup['mode']
  venue_name?: string | null
  venue_address?: string | null
  map_url?: string | null
  meeting_url?: string | null
  starts_at: string
  ends_at?: string | null
  capacity: number
  apply_deadline?: string | null
  requires_approval?: boolean
  fee_note?: string | null
  posted_as?: PostAs
}

async function loadMemberMap(ids: string[]): Promise<Map<string, Member>> {
  const unique = [...new Set(ids.filter(Boolean))]
  const map = new Map<string, Member>()
  if (!unique.length) return map

  if (useMockData()) {
    for (const id of unique) {
      const m = MOCK_MEMBERS.find((x) => x.id === id)
      if (m) map.set(id, m)
    }
    return map
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_PUBLIC_COLUMNS)
    .in('id', unique)
  if (error) throw error
  for (const m of data || []) {
    map.set((m as Member).id, { email: '', ...(m as object) } as Member)
  }
  return map
}

async function hydrateMeetup(
  meetup: Meetup,
  rsvps: MeetupRsvp[],
  announcements: MeetupAnnouncement[],
  members: Map<string, Member>
): Promise<MeetupWithDetails> {
  const hostMember = members.get(meetup.host_id)
  const host = hostMember
    ? toPublicAuthor(hostMember, meetup.posted_as)
    : {
        kind: 'real' as const,
        id: meetup.host_id,
        display_name: '호스트',
        bio: null,
        avatar_url: null,
      }
  return {
    ...meetup,
    host,
    rsvps,
    announcements,
    confirmed_count: countConfirmed(rsvps),
    waitlisted_count: countWaitlisted(rsvps),
  }
}

export async function getMeetupDetails(meetupId: string): Promise<MeetupWithDetails | null> {
  if (useMockData()) return mockGetDetails(meetupId)

  const supabase = await sb()
  const { data: meetup, error } = await supabase
    .from('meetups')
    .select('*')
    .eq('id', meetupId)
    .maybeSingle()
  if (error) throw error
  if (!meetup) return null

  const [{ data: rsvps }, { data: announcements }] = await Promise.all([
    supabase.from('meetup_rsvps').select('*').eq('meetup_id', meetupId),
    supabase.from('meetup_announcements').select('*').eq('meetup_id', meetupId).order('created_at'),
  ])

  const members = await loadMemberMap([
    (meetup as Meetup).host_id,
    ...((rsvps || []) as MeetupRsvp[]).map((r) => r.member_id),
  ])
  return hydrateMeetup(
    meetup as Meetup,
    (rsvps || []) as MeetupRsvp[],
    (announcements || []) as MeetupAnnouncement[],
    members
  )
}

export async function listMeetupsDetailed(): Promise<MeetupWithDetails[]> {
  if (useMockData()) return mockListDetailed()

  const supabase = await sb()
  const { data: meetups, error } = await supabase
    .from('meetups')
    .select('*')
    .order('starts_at', { ascending: true })
  if (error) throw error

  const ids = (meetups || []).map((m: Meetup) => m.id)
  if (!ids.length) return []

  const [{ data: rsvps }, { data: announcements }] = await Promise.all([
    supabase.from('meetup_rsvps').select('*').in('meetup_id', ids),
    supabase.from('meetup_announcements').select('*').in('meetup_id', ids),
  ])

  const members = await loadMemberMap([
    ...(meetups as Meetup[]).map((m) => m.host_id),
    ...((rsvps || []) as MeetupRsvp[]).map((r) => r.member_id),
  ])

  const result: MeetupWithDetails[] = []
  for (const meetup of meetups as Meetup[]) {
    result.push(
      await hydrateMeetup(
        meetup,
        ((rsvps || []) as MeetupRsvp[]).filter((r) => r.meetup_id === meetup.id),
        ((announcements || []) as MeetupAnnouncement[]).filter(
          (a) => a.meetup_id === meetup.id
        ),
        members
      )
    )
  }
  return result
}

export async function upcomingMeetups(limit = 3): Promise<MeetupWithDetails[]> {
  if (useMockData()) return mockUpcoming(limit)
  const all = await listMeetupsDetailed()
  return all.filter((m) => m.status === 'open').slice(0, limit)
}

export async function getMeetupAnnouncements(meetupId: string): Promise<MeetupAnnouncement[]> {
  if (useMockData()) {
    return [
      ...mockGetAnnouncements(meetupId),
      ...EXTRA_ANNOUNCEMENTS.filter((a) => a.meetup_id === meetupId),
    ]
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('meetup_announcements')
    .select('*')
    .eq('meetup_id', meetupId)
    .order('created_at')
  if (error) throw error
  return (data || []) as MeetupAnnouncement[]
}

export async function createMeetup(
  member: Member,
  data: CreateMeetupInput
): Promise<Meetup> {
  const postedAs = data.posted_as || 'real'
  if (useMockData()) {
    const meetup: Meetup = {
      id: `meetup-${Date.now()}`,
      title: data.title,
      description: data.description,
      mode: data.mode,
      venue_name: data.venue_name ?? null,
      venue_address: data.venue_address ?? null,
      map_url: data.map_url ?? null,
      meeting_url: data.meeting_url ?? null,
      starts_at: data.starts_at,
      ends_at: data.ends_at ?? null,
      capacity: data.capacity,
      apply_deadline: data.apply_deadline ?? null,
      requires_approval: data.requires_approval ?? false,
      fee_note: data.fee_note ?? null,
      host_id: member.id,
      posted_as: postedAs,
      nickname_profile_id:
        postedAs === 'nickname' ? nicknameProfilePublicId(member.id) : null,
      status: 'open',
      cancelled_at: null,
      recap_post_id: null,
      recap_photos: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    MOCK_MEETUPS.unshift(meetup)
    return meetup
  }

  const supabase = await sb()
  const { data: inserted, error } = await supabase
    .from('meetups')
    .insert({
      title: data.title,
      description: data.description,
      mode: data.mode,
      venue_name: data.venue_name ?? null,
      venue_address: data.venue_address ?? null,
      map_url: data.map_url ?? null,
      meeting_url: data.meeting_url ?? null,
      starts_at: data.starts_at,
      ends_at: data.ends_at ?? null,
      capacity: data.capacity,
      apply_deadline: data.apply_deadline ?? null,
      requires_approval: data.requires_approval ?? false,
      fee_note: data.fee_note ?? null,
      host_id: member.id,
      posted_as: postedAs,
      nickname_profile_id:
        postedAs === 'nickname' ? nicknameProfilePublicId(member.id) : null,
      status: 'open',
    })
    .select('*')
    .single()
  if (error) throw error
  return inserted as Meetup
}

export async function updateMeetupRecap(
  meetupId: string,
  hostId: string,
  patch: { recap_post_id?: string | null; recap_photos?: string[] | null }
): Promise<MeetupWithDetails | null> {
  if (useMockData()) {
    const meetup = MOCK_MEETUPS.find((m) => m.id === meetupId)
    if (!meetup || meetup.host_id !== hostId) return null
    meetup.recap_post_id = patch.recap_post_id ?? meetup.recap_post_id
    meetup.recap_photos = patch.recap_photos ?? meetup.recap_photos
    meetup.status = 'past'
    meetup.updated_at = new Date().toISOString()
    return mockGetDetails(meetupId)
  }

  const supabase = await sb()
  const { error } = await supabase
    .from('meetups')
    .update({
      recap_post_id: patch.recap_post_id,
      recap_photos: patch.recap_photos,
      status: 'past',
      updated_at: new Date().toISOString(),
    })
    .eq('id', meetupId)
    .eq('host_id', hostId)
  if (error) throw error
  return getMeetupDetails(meetupId)
}

export async function cancelMeetup(meetupId: string, hostId: string): Promise<boolean> {
  if (useMockData()) {
    const meetup = MOCK_MEETUPS.find((m) => m.id === meetupId)
    if (!meetup || meetup.host_id !== hostId) return false
    meetup.status = 'cancelled'
    meetup.cancelled_at = new Date().toISOString()
    meetup.updated_at = meetup.cancelled_at
    return true
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('meetups')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('id', meetupId)
    .eq('host_id', hostId)
    .select('id')
  if (error) throw error
  return (data?.length ?? 0) > 0
}

export async function createAnnouncement(
  meetupId: string,
  hostId: string,
  body: string
): Promise<MeetupAnnouncement> {
  if (useMockData()) {
    const meetup = MOCK_MEETUPS.find((m) => m.id === meetupId)
    if (!meetup) throw new Error('모임을 찾을 수 없습니다.')
    if (meetup.host_id !== hostId) throw new Error('호스트만 공지할 수 있습니다.')
    const ann: MeetupAnnouncement = {
      id: `ann-${Date.now()}`,
      meetup_id: meetupId,
      body,
      created_at: new Date().toISOString(),
    }
    EXTRA_ANNOUNCEMENTS.push(ann)
    return ann
  }

  const supabase = await sb()
  const { data: meetup, error: mErr } = await supabase
    .from('meetups')
    .select('host_id')
    .eq('id', meetupId)
    .maybeSingle()
  if (mErr) throw mErr
  if (!meetup) throw new Error('모임을 찾을 수 없습니다.')
  if (meetup.host_id !== hostId) throw new Error('호스트만 공지할 수 있습니다.')

  const { data, error } = await supabase
    .from('meetup_announcements')
    .insert({ meetup_id: meetupId, body })
    .select('*')
    .single()
  if (error) throw error
  return data as MeetupAnnouncement
}

type RsvpAction = 'apply' | 'cancel' | 'approve' | 'reject'

export async function handleMeetupRsvp(
  meetupId: string,
  member: Member,
  opts: {
    action: RsvpAction
    note?: string
    posted_as?: PostAs
    rsvp_id?: string
  }
): Promise<{ rsvp?: MeetupRsvp; meetup?: MeetupWithDetails; success?: boolean }> {
  if (useMockData()) {
    const meetup = MOCK_MEETUPS.find((m) => m.id === meetupId)
    if (!meetup) throw new Error('모임을 찾을 수 없습니다.')

    let rsvps = MUTABLE_RSVPS.filter((r) => r.meetup_id === meetupId)
    const others = MUTABLE_RSVPS.filter((r) => r.meetup_id !== meetupId)

    if (opts.action === 'apply') {
      if (!isApplyOpen(meetup)) throw new Error('신청이 마감되었습니다.')
      const existing = rsvps.find(
        (r) =>
          r.member_id === member.id &&
          r.status !== 'cancelled' &&
          r.status !== 'rejected'
      )
      if (existing) throw new Error('이미 신청했습니다.')
      const postedAs = opts.posted_as || 'real'
      const status = decideRsvpOnApply(meetup, rsvps)
      const rsvp: MeetupRsvp = {
        id: `rsvp-${Date.now()}`,
        meetup_id: meetupId,
        member_id: member.id,
        posted_as: postedAs,
        nickname_profile_id:
          postedAs === 'nickname' ? nicknameProfilePublicId(member.id) : null,
        status,
        note: opts.note || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      MUTABLE_RSVPS.splice(0, MUTABLE_RSVPS.length, ...others, ...rsvps, rsvp)
      const details = mockGetDetails(meetupId)!
      details.rsvps = MUTABLE_RSVPS.filter((r) => r.meetup_id === meetupId)
      return { rsvp, meetup: details }
    }

    if (opts.action === 'cancel') {
      rsvps = cancelOwnRsvp(meetup, rsvps, member.id)
      MUTABLE_RSVPS.splice(0, MUTABLE_RSVPS.length, ...others, ...rsvps)
      return { success: true }
    }

    if (opts.action === 'approve' || opts.action === 'reject') {
      if (meetup.host_id !== member.id) throw new Error('호스트만 승인/거절할 수 있습니다.')
      if (!opts.rsvp_id) throw new Error('rsvp_id가 필요합니다.')
      if (opts.action === 'approve') {
        const result = approveRsvp(meetup, rsvps, opts.rsvp_id)
        if (!result.ok) throw new Error(result.reason)
        rsvps = result.rsvps
      } else {
        const { rejectRsvp } = await import('@/lib/meetup-rules')
        rsvps = rejectRsvp(rsvps, opts.rsvp_id)
      }
      MUTABLE_RSVPS.splice(0, MUTABLE_RSVPS.length, ...others, ...rsvps)
      return { success: true }
    }

    throw new Error('알 수 없는 액션')
  }

  const supabase = await sb()
  const { data: meetup, error } = await supabase
    .from('meetups')
    .select('*')
    .eq('id', meetupId)
    .maybeSingle()
  if (error) throw error
  if (!meetup) throw new Error('모임을 찾을 수 없습니다.')

  const { data: existingRsvps } = await supabase
    .from('meetup_rsvps')
    .select('*')
    .eq('meetup_id', meetupId)
  const rsvps = (existingRsvps || []) as MeetupRsvp[]

  if (opts.action === 'apply') {
    if (!isApplyOpen(meetup as Meetup)) throw new Error('신청이 마감되었습니다.')
    const existing = rsvps.find(
      (r) =>
        r.member_id === member.id &&
        r.status !== 'cancelled' &&
        r.status !== 'rejected'
    )
    if (existing) throw new Error('이미 신청했습니다.')
    const postedAs = opts.posted_as || 'real'
    const status = decideRsvpOnApply(meetup as Meetup, rsvps)
    const { data: rsvp, error: insErr } = await supabase
      .from('meetup_rsvps')
      .insert({
        meetup_id: meetupId,
        member_id: member.id,
        posted_as: postedAs,
        nickname_profile_id:
          postedAs === 'nickname' ? nicknameProfilePublicId(member.id) : null,
        status,
        note: opts.note || null,
      })
      .select('*')
      .single()
    if (insErr) throw insErr
    const details = await getMeetupDetails(meetupId)
    return { rsvp: rsvp as MeetupRsvp, meetup: details ?? undefined }
  }

  if (opts.action === 'cancel') {
    await supabase
      .from('meetup_rsvps')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('meetup_id', meetupId)
      .eq('member_id', member.id)
    return { success: true }
  }

  if (opts.action === 'approve' || opts.action === 'reject') {
    if ((meetup as Meetup).host_id !== member.id) {
      throw new Error('호스트만 승인/거절할 수 있습니다.')
    }
    if (!opts.rsvp_id) throw new Error('rsvp_id가 필요합니다.')
    if (opts.action === 'approve') {
      const result = approveRsvp(meetup as Meetup, rsvps, opts.rsvp_id)
      if (!result.ok) throw new Error(result.reason)
      for (const r of result.rsvps) {
        await supabase
          .from('meetup_rsvps')
          .update({ status: r.status, updated_at: new Date().toISOString() })
          .eq('id', r.id)
      }
    } else {
      await supabase
        .from('meetup_rsvps')
        .update({ status: 'rejected', updated_at: new Date().toISOString() })
        .eq('id', opts.rsvp_id)
    }
    return { success: true }
  }

  throw new Error('알 수 없는 액션')
}

export function sanitizeMeetup(m: MeetupWithDetails, viewerId: string) {
  const isHost = m.host_id === viewerId
  const myRsvp = m.rsvps.find((r) => r.member_id === viewerId)
  const canSeeUrl =
    m.mode === 'online' && (isHost || myRsvp?.status === 'confirmed')
  return {
    ...m,
    meeting_url: canSeeUrl ? m.meeting_url : null,
    attendees: m.rsvps
      .filter(
        (r) =>
          r.status === 'confirmed' || r.status === 'pending' || r.status === 'waitlisted'
      )
      .map((r) => ({
        id: r.id,
        status: r.status,
        posted_as: r.posted_as,
        note: isHost ? r.note : null,
        member_id: isHost || r.posted_as === 'real' ? r.member_id : undefined,
        nickname_profile_id: r.nickname_profile_id,
        created_at: r.created_at,
      })),
  }
}
