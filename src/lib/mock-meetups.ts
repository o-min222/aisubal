import type {
  Meetup,
  MeetupAnnouncement,
  MeetupRsvp,
  PublicAuthor,
} from '@/lib/supabase/types'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { toPublicAuthor, nicknameProfilePublicId } from '@/lib/profile'
import { countConfirmed, countWaitlisted } from '@/lib/meetup-rules'
import type { MeetupWithDetails } from '@/lib/data/types'

export type { MeetupWithDetails } from '@/lib/data/types'

function hostAuthor(meetup: Meetup): PublicAuthor {
  const member = MOCK_MEMBERS.find((m) => m.id === meetup.host_id)!
  return toPublicAuthor(member, meetup.posted_as)
}

const RSVPS: MeetupRsvp[] = [
  {
    id: 'rsvp-1',
    meetup_id: 'meetup-1',
    member_id: 'member-2',
    posted_as: 'real',
    nickname_profile_id: null,
    status: 'confirmed',
    note: '노트북 가져갈게요',
    created_at: '2026-11-18T10:00:00Z',
    updated_at: '2026-11-18T10:00:00Z',
  },
  {
    id: 'rsvp-2',
    meetup_id: 'meetup-1',
    member_id: 'member-3',
    posted_as: 'real',
    nickname_profile_id: null,
    status: 'confirmed',
    note: null,
    created_at: '2026-11-19T08:00:00Z',
    updated_at: '2026-11-19T08:00:00Z',
  },
  {
    id: 'rsvp-3',
    meetup_id: 'meetup-2',
    member_id: 'member-1',
    posted_as: 'nickname',
    nickname_profile_id: nicknameProfilePublicId('member-1'),
    status: 'confirmed',
    note: null,
    created_at: '2026-11-20T12:00:00Z',
    updated_at: '2026-11-20T12:00:00Z',
  },
  {
    id: 'rsvp-4',
    meetup_id: 'meetup-2',
    member_id: 'member-3',
    posted_as: 'real',
    nickname_profile_id: null,
    status: 'waitlisted',
    note: '정원 차면 다음에도요',
    created_at: '2026-11-21T09:00:00Z',
    updated_at: '2026-11-21T09:00:00Z',
  },
  {
    id: 'rsvp-5',
    meetup_id: 'meetup-3',
    member_id: 'member-2',
    posted_as: 'nickname',
    nickname_profile_id: nicknameProfilePublicId('member-2'),
    status: 'pending',
    note: '승인 부탁드려요',
    created_at: '2026-11-21T11:00:00Z',
    updated_at: '2026-11-21T11:00:00Z',
  },
]

const ANNOUNCEMENTS: MeetupAnnouncement[] = [
  {
    id: 'ann-1',
    meetup_id: 'meetup-1',
    body: '강남역 11번 출구 앞에서 모입니다. 5분 일찍 와 주세요!',
    created_at: '2026-11-20T03:00:00Z',
  },
]

/** Mutable store for RSVP mutations in API/dev mode */
export let MUTABLE_RSVPS: MeetupRsvp[] = [...RSVPS]

export function resetMeetupRsvps() {
  MUTABLE_RSVPS = [...RSVPS]
}

export const MOCK_MEETUPS: Meetup[] = [
  {
    id: 'meetup-1',
    title: 'Cursor 파워유저 오프라인 모임',
    description: `에이전트 워크플로, Rules, MCP 설정을 공유하는 소규모 오프라인 모임입니다.

## 이런 분께
- Cursor를 매일 쓰는 분
- 팀 내 AI 도입을 고민 중인 분

간단한 피자와 음료가 제공됩니다.`,
    mode: 'offline',
    venue_name: '위워크 강남',
    venue_address: '서울 강남구 테헤란로 152',
    map_url: 'https://map.naver.com/p/search/위워크%20강남',
    meeting_url: null,
    starts_at: '2026-11-28T10:00:00+09:00',
    ends_at: '2026-11-28T12:00:00+09:00',
    capacity: 12,
    apply_deadline: '2026-11-27T18:00:00+09:00',
    requires_approval: false,
    fee_note: '참가비 없음 · 음료 제공',
    host_id: 'member-1',
    posted_as: 'real',
    nickname_profile_id: null,
    status: 'open',
    cancelled_at: null,
    recap_post_id: null,
    recap_photos: null,
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-20T03:00:00Z',
  },
  {
    id: 'meetup-2',
    title: '온라인: MCP 서버 라이브 코딩',
    description: `90분 동안 간단한 MCP 서버를 같이 만들어 봅니다. Zoom 링크는 확정 참가자에게만 공개됩니다.`,
    mode: 'online',
    venue_name: null,
    venue_address: null,
    map_url: null,
    meeting_url: 'https://zoom.us/j/aisubal-mcp-lab',
    starts_at: '2026-12-05T20:00:00+09:00',
    ends_at: '2026-12-05T21:30:00+09:00',
    capacity: 2, // small so waitlist is visible in seed
    apply_deadline: '2026-12-05T12:00:00+09:00',
    requires_approval: false,
    fee_note: null,
    host_id: 'member-2',
    posted_as: 'nickname',
    nickname_profile_id: nicknameProfilePublicId('member-2'),
    status: 'open',
    cancelled_at: null,
    recap_post_id: null,
    recap_photos: null,
    created_at: '2026-11-18T00:00:00Z',
    updated_at: '2026-11-21T09:00:00Z',
  },
  {
    id: 'meetup-3',
    title: '승인제: AI 사이드프로젝트 쇼케이스',
    description: `준비한 데모를 5분씩 공유하는 쇼케이스. 호스트 승인 후 참가 확정.`,
    mode: 'offline',
    venue_name: '패스트파이브 성수',
    venue_address: '서울 성동구 아차산로 92',
    map_url: 'https://map.naver.com/p/search/패스트파이브%20성수',
    meeting_url: null,
    starts_at: '2026-12-12T19:00:00+09:00',
    ends_at: '2026-12-12T21:00:00+09:00',
    capacity: 20,
    apply_deadline: '2026-12-10T23:59:00+09:00',
    requires_approval: true,
    fee_note: '현장 음료 자부담',
    host_id: 'member-1',
    posted_as: 'real',
    nickname_profile_id: null,
    status: 'open',
    cancelled_at: null,
    recap_post_id: null,
    recap_photos: null,
    created_at: '2026-11-19T00:00:00Z',
    updated_at: '2026-11-21T11:00:00Z',
  },
  {
    id: 'meetup-4',
    title: '11월 회고: AI 툴 스택 공유회 (종료)',
    description: `지난 한 달 동안 쓴 AI 툴을 돌아본 모임. 사진과 회고 글을 남겼습니다.`,
    mode: 'offline',
    venue_name: '카페 다운타우너 연남',
    venue_address: '서울 마포구 연남동',
    map_url: null,
    meeting_url: null,
    starts_at: '2026-11-08T15:00:00+09:00',
    ends_at: '2026-11-08T17:00:00+09:00',
    capacity: 8,
    apply_deadline: '2026-11-07T12:00:00+09:00',
    requires_approval: false,
    fee_note: null,
    host_id: 'member-3',
    posted_as: 'real',
    nickname_profile_id: null,
    status: 'past',
    cancelled_at: null,
    recap_post_id: 'post-1',
    recap_photos: [
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800',
      'https://images.unsplash.com/photo-1591115765373-5207764f72e7?w=800',
    ],
    created_at: '2026-10-28T00:00:00Z',
    updated_at: '2026-11-09T00:00:00Z',
  },
]

export function getMeetupRsvps(meetupId: string): MeetupRsvp[] {
  return MUTABLE_RSVPS.filter((r) => r.meetup_id === meetupId)
}

export function getMeetupAnnouncements(meetupId: string): MeetupAnnouncement[] {
  return ANNOUNCEMENTS.filter((a) => a.meetup_id === meetupId)
}

export function getMeetupDetails(meetupId: string): MeetupWithDetails | null {
  const meetup = MOCK_MEETUPS.find((m) => m.id === meetupId)
  if (!meetup) return null
  const rsvps = getMeetupRsvps(meetupId)
  return {
    ...meetup,
    host: hostAuthor(meetup),
    rsvps,
    announcements: getMeetupAnnouncements(meetupId),
    confirmed_count: countConfirmed(rsvps),
    waitlisted_count: countWaitlisted(rsvps),
  }
}

export function listMeetupsDetailed(): MeetupWithDetails[] {
  return MOCK_MEETUPS.map((m) => getMeetupDetails(m.id)!).sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  )
}

export function upcomingMeetups(limit = 3): MeetupWithDetails[] {
  return listMeetupsDetailed()
    .filter((m) => m.status === 'open')
    .slice(0, limit)
}
