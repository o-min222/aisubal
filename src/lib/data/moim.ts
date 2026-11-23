import { DEV_ID, MOCK_PEOPLE, mockHandle, mockPerson } from '@/lib/mock-social'
import {
  applyBlock,
  canSeePrivate,
  countStatus,
  decideOnApply,
  decideRsvp,
  normalizeQuestions,
  promoteWaitlist,
  validateAnswers,
  waitlistPosition,
  type DecideAction,
  type MoimMode,
  type MoimQuestion,
  type MoimRsvp,
  type MoimStatus,
  type RsvpStatus,
} from '@/lib/moim-rules'
import { mockGroups } from './groups'
import { mockAppendFeedPost, mockFeedPost } from './feed'
import { sb, isMock } from './client'
import { moimThreadContent, normalizeInvites, toTimelineMoim } from '@/lib/moim-thread-rules'
import type { TimelineMoim } from '@/components/timeline/types'

/** Seats when the host doesn't say (A29: the minimal form doesn't ask; matches moim__validate). */
export const DEFAULT_CAPACITY = 30

/**
 * 모임 (formerly 밋업). Production reads and writes go through the 0007
 * moim_* SECURITY DEFINER RPCs; the exact place / map / online link live in
 * meetup_private and only reach managers and confirmed attendees.
 */
export type MoimAuthor = { kind: 'real' | 'nickname'; id: string; name: string; avatarUrl: string | null }
export type MoimGroupRef = { id: string; slug: string; name: string; emoji: string | null }
export type MyRsvp = { id: string; status: RsvpStatus; answers: Record<string, string>; note: string | null; createdAt: string; position: number | null }
export type Moim = {
  id: string
  title: string
  description: string
  mode: MoimMode
  venueName: string | null
  startsAt: string
  /** date only — the time is still open (A29) */
  timeTbd: boolean
  /** the post whose comments are where details get discussed (A29; null for older 모임) */
  threadPostId: string | null
  endsAt: string | null
  capacity: number
  applyDeadline: string | null
  requiresApproval: boolean
  status: MoimStatus
  feeNote: string | null
  membersOnly: boolean
  questions: MoimQuestion[]
  createdAt: string
  host: MoimAuthor
  hostId: string | null
  group: MoimGroupRef | null
  confirmed: number
  waitlisted: number
  pending: number
  isHost: boolean
  canManage: boolean
  isGroupMember: boolean | null
  myRsvp: MyRsvp | null
}
export type MoimApplicant = {
  id: string
  memberId: string
  status: RsvpStatus
  answers: Record<string, string>
  note: string | null
  createdAt: string
  waitlistedAt: string | null
  author: MoimAuthor
}
export type MoimDetail = Moim & {
  private: { venueAddress: string | null; mapUrl: string | null; meetingUrl: string | null } | null
  /** null = viewer is not the host/manager or a confirmed attendee (names are hidden). Names are @handles. */
  attendees: Array<MoimAuthor & { memberId: string }> | null
  announcements: Array<{ id: string; body: string; createdAt: string }>
  applicants: MoimApplicant[] | null
}
export type MoimTab = 'upcoming' | 'mine' | 'hosting' | 'past'
/** Absent optional fields are not sent: create uses the DB defaults, edit keeps what's stored. */
export type MoimInput = {
  title: string
  description?: string
  mode: MoimMode
  venueName?: string | null
  venueAddress?: string | null
  mapUrl?: string | null
  meetingUrl?: string | null
  startsAt: string
  timeTbd?: boolean
  endsAt?: string | null
  applyDeadline?: string | null
  capacity?: number
  requiresApproval?: boolean
  feeNote?: string | null
  groupId?: string | null
  membersOnly?: boolean
  questions?: Array<{ label: string; required: boolean }>
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function author(a: any): MoimAuthor {
  return { kind: a?.kind === 'nickname' ? 'nickname' : 'real', id: String(a?.id ?? ''), name: String(a?.name ?? '멤버'), avatarUrl: a?.avatar_url ?? null }
}
function fromRow(r: any): Moim {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    mode: r.mode,
    venueName: r.venue_name ?? null,
    startsAt: r.starts_at,
    timeTbd: Boolean(r.time_tbd),
    threadPostId: r.thread_post_id ?? null,
    endsAt: r.ends_at ?? null,
    capacity: Number(r.capacity),
    applyDeadline: r.apply_deadline ?? null,
    requiresApproval: Boolean(r.requires_approval),
    status: r.status,
    feeNote: r.fee_note ?? null,
    membersOnly: Boolean(r.members_only),
    questions: Array.isArray(r.questions) ? r.questions : [],
    createdAt: r.created_at,
    host: author(r.host),
    hostId: r.host_id ?? null,
    group: r.group ? { id: r.group.id, slug: r.group.slug, name: r.group.name, emoji: r.group.emoji ?? null } : null,
    confirmed: Number(r.confirmed ?? 0),
    waitlisted: Number(r.waitlisted ?? 0),
    pending: Number(r.pending ?? 0),
    isHost: Boolean(r.is_host),
    canManage: Boolean(r.can_manage),
    isGroupMember: r.is_group_member ?? null,
    myRsvp: r.my_rsvp
      ? {
          id: r.my_rsvp.id,
          status: r.my_rsvp.status,
          answers: r.my_rsvp.answers || {},
          note: r.my_rsvp.note ?? null,
          createdAt: r.my_rsvp.created_at,
          position: r.my_rsvp.position == null ? null : Number(r.my_rsvp.position),
        }
      : null,
  }
}
function detailFromRow(r: any): MoimDetail {
  return {
    ...fromRow(r),
    private: r.private
      ? { venueAddress: r.private.venue_address ?? null, mapUrl: r.private.map_url ?? null, meetingUrl: r.private.meeting_url ?? null }
      : null,
    attendees: r.attendees == null ? null : r.attendees.map((a: any) => ({ ...author(a), memberId: a.member_id })),
    announcements: (r.announcements || []).map((a: any) => ({ id: a.id, body: a.body, createdAt: a.created_at })),
    applicants: r.applicants
      ? r.applicants.map((a: any) => ({
          id: a.id,
          memberId: a.member_id,
          status: a.status,
          answers: a.answers || {},
          note: a.note ?? null,
          createdAt: a.created_at,
          waitlistedAt: a.waitlisted_at ?? null,
          author: author(a.author),
        }))
      : null,
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Only the keys the caller set (undefined = not sent), so moim_update keeps the rest. */
export function toPayload(i: MoimInput) {
  const p: Record<string, unknown> = {
    title: i.title,
    mode: i.mode,
    venue_name: i.venueName || '',
    starts_at: i.startsAt,
    group_id: i.groupId || '',
    members_only: Boolean(i.membersOnly),
  }
  const opt = (k: string, v: unknown, empty: unknown = '') => {
    if (v !== undefined) p[k] = v ?? empty
  }
  opt('time_tbd', i.timeTbd, false)
  opt('description', i.description)
  opt('venue_address', i.venueAddress)
  opt('map_url', i.mapUrl)
  opt('meeting_url', i.meetingUrl)
  opt('ends_at', i.endsAt)
  opt('apply_deadline', i.applyDeadline)
  opt('capacity', i.capacity, undefined)
  opt('requires_approval', i.requiresApproval, undefined)
  opt('fee_note', i.feeNote)
  opt('questions', i.questions, [])
  return p
}

// ------------------------------------------------------------------ mock
type MockMoim = {
  id: string
  title: string
  description: string
  mode: MoimMode
  venueName: string | null
  venueAddress: string | null
  mapUrl: string | null
  meetingUrl: string | null
  startsAt: string
  timeTbd?: boolean
  threadPostId?: string | null
  endsAt: string | null
  capacity: number
  applyDeadline: string | null
  requiresApproval: boolean
  status: MoimStatus
  feeNote: string | null
  membersOnly: boolean
  questions: MoimQuestion[]
  hostId: string
  groupId: string | null
  createdAt: string
  rsvps: MoimRsvp[]
  announcements: Array<{ id: string; body: string; createdAt: string }>
}
const gm = globalThis as unknown as { __aisubalMoim?: MockMoim[] }
const me = (id: string) => (id === 'dev-user-id' ? DEV_ID : id)

function seedRsvp(id: string, memberId: string, status: RsvpStatus, h: number, answers: Record<string, string> = {}): MoimRsvp {
  const at = new Date(Date.now() - h * 3600_000).toISOString()
  return { id, memberId, status, answers, note: null, createdAt: at, waitlistedAt: status === 'waitlisted' ? at : null, decidedAt: status === 'confirmed' ? at : null }
}

export function mockMoims(): MockMoim[] {
  if (gm.__aisubalMoim) return gm.__aisubalMoim
  const day = (d: number, h = 19) => {
    const t = new Date(Date.now() + d * 86400_000)
    t.setUTCHours(h - 9, 0, 0, 0)
    return t.toISOString()
  }
  const base = { endsAt: null, applyDeadline: null, feeNote: null, membersOnly: false, groupId: null, status: 'open' as MoimStatus, createdAt: new Date(Date.now() - 5 * 86400_000).toISOString(), announcements: [] as MockMoim['announcements'] }
  gm.__aisubalMoim = [
    {
      ...base,
      id: 'moim-1',
      title: '판교 AI 에이전트 저녁 모임',
      description: '각자 쓰는 코딩 에이전트 워크플로를 10분씩 보여주고 저녁 먹어요. 노트북 지참!',
      mode: 'offline',
      venueName: '판교역 인근',
      venueAddress: '경기 성남시 분당구 판교역로 000, 3층 세미나실',
      mapUrl: 'https://map.naver.com/p/search/판교역',
      meetingUrl: null,
      startsAt: day(4),
      endsAt: day(4, 22),
      capacity: 4,
      applyDeadline: day(3, 23),
      requiresApproval: false,
      feeNote: '저녁 1/N (약 2만원)',
      questions: [
        { id: 'q1', label: '보여주고 싶은 워크플로가 있나요?', required: true },
        { id: 'q2', label: '못 먹는 음식', required: false },
      ],
      hostId: DEV_ID,
      rsvps: [
        seedRsvp('r1', 'member-2', 'confirmed', 50, { q1: 'Cursor + MCP로 PRD 쓰기' }),
        seedRsvp('r2', 'member-3', 'confirmed', 48, { q1: 'Claude Code 훅으로 테스트 자동화' }),
        seedRsvp('r3', 'member-4', 'confirmed', 40, { q1: '이미지 생성 파이프라인', q2: '오이' }),
        seedRsvp('r4', 'member-1', 'confirmed', 30, { q1: '에이전트 평가 셋업' }),
        seedRsvp('r5', 'member-5', 'waitlisted', 20, { q1: '데이터 분석 노트북 자동화' }),
        seedRsvp('r6', 'member-7', 'waitlisted', 10, { q1: '노코드 + LLM' }),
      ],
      announcements: [{ id: 'a1', body: '세미나실 프로젝터 있어요. HDMI/USB-C 어댑터 준비됩니다.', createdAt: new Date(Date.now() - 86400_000).toISOString() }],
    },
    {
      ...base,
      id: 'moim-2',
      title: 'Claude Code 훅 & 서브에이전트 온라인 스터디',
      description: '그룹 멤버끼리 설정 파일을 화면 공유로 리뷰해요. 승인제로 운영합니다.',
      mode: 'online',
      venueName: null,
      venueAddress: null,
      mapUrl: null,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      startsAt: day(6, 21),
      capacity: 8,
      requiresApproval: true,
      membersOnly: true,
      groupId: 'grp-claude-code',
      questions: [{ id: 'q1', label: '지금 쓰는 훅/규칙을 한 줄로 소개해주세요', required: true }],
      hostId: 'member-4',
      rsvps: [
        seedRsvp('r7', 'member-2', 'confirmed', 30, { q1: 'pre-commit 훅으로 lint' }),
        seedRsvp('r8', 'member-1', 'pending', 6, { q1: '서브에이전트로 리뷰 분리' }),
        seedRsvp('r9', 'member-3', 'pending', 3, { q1: 'MCP 서버 테스트 훅' }),
      ],
    },
    {
      ...base,
      id: 'moim-3',
      title: '성수 프롬프트 엔지니어링 번개',
      description: '카페에서 가볍게 프롬프트 노하우 나눠요. 선착순!',
      mode: 'offline',
      venueName: '성수역 근처 카페',
      venueAddress: '서울 성동구 연무장길 00, 2층',
      mapUrl: 'https://map.kakao.com/?q=성수역',
      meetingUrl: null,
      startsAt: day(2, 15),
      capacity: 10,
      requiresApproval: false,
      questions: [],
      hostId: 'member-1',
      rsvps: [seedRsvp('r10', DEV_ID, 'confirmed', 26), seedRsvp('r11', 'member-2', 'confirmed', 20)],
    },
    {
      ...base,
      id: 'moim-4',
      title: 'MCP 서버 코드 리뷰 나이트',
      description: 'MCP 빌더스 그룹 멤버 전용 리뷰 세션.',
      mode: 'online',
      venueName: null,
      venueAddress: null,
      mapUrl: null,
      meetingUrl: 'https://zoom.us/j/000000',
      startsAt: day(9, 20),
      capacity: 12,
      requiresApproval: true,
      membersOnly: true,
      groupId: 'grp-mcp',
      questions: [],
      hostId: 'member-3',
      rsvps: [],
    },
    {
      ...base,
      id: 'moim-5',
      title: '강남 RAG 실전 세미나',
      description: '자리 2개뿐인 소규모 세미나.',
      mode: 'offline',
      venueName: '강남역',
      venueAddress: '서울 강남구 테헤란로 000',
      mapUrl: null,
      meetingUrl: null,
      startsAt: day(5, 19),
      capacity: 2,
      requiresApproval: false,
      questions: [],
      hostId: 'member-2',
      rsvps: [seedRsvp('r12', 'member-3', 'confirmed', 40), seedRsvp('r13', 'member-4', 'confirmed', 39), seedRsvp('r14', DEV_ID, 'waitlisted', 12)],
    },
    {
      ...base,
      id: 'moim-6',
      title: '지난달 AI 해커톤 뒤풀이',
      description: '지난 모임',
      mode: 'offline',
      venueName: '을지로',
      venueAddress: null,
      mapUrl: null,
      meetingUrl: null,
      startsAt: day(-12),
      capacity: 20,
      requiresApproval: false,
      questions: [],
      hostId: DEV_ID,
      status: 'past',
      rsvps: [seedRsvp('r15', 'member-2', 'confirmed', 400)],
    },
  ]
  // A30: seeded 모임 have their thread posts too (public upcoming, past, and members-only group ones)
  const seeded: Record<string, number> = { 'moim-3': 5, 'moim-5': 30, 'moim-6': 400, 'moim-2': 8 }
  for (const m of gm.__aisubalMoim) {
    const h = seeded[m.id]
    if (h == null) continue
    m.threadPostId = mockThreadPost(m.hostId, m.groupId, { ...m, timeTbd: false }, new Date(Date.now() - h * 3600_000).toISOString())
  }
  return gm.__aisubalMoim
}

function mockRoleIn(groupId: string | null, viewer: string) {
  if (!groupId) return null
  const m = mockGroups().members.find((x) => x.group_id === groupId && x.member_id === viewer && x.status === 'active')
  return m?.role ?? null
}
function mockCanManage(m: MockMoim, viewer: string) {
  const role = mockRoleIn(m.groupId, viewer)
  return m.hostId === viewer || role === 'owner' || role === 'mod'
}
function mockGroupRef(id: string | null): MoimGroupRef | null {
  const gr = id ? mockGroups().groups.find((x) => x.id === id) : null
  return gr ? { id: gr.id, slug: gr.slug, name: gr.name, emoji: gr.emoji } : null
}
function mockVisible(m: MockMoim, viewer: string) {
  if (!m.groupId) return true
  const gr = mockGroups().groups.find((x) => x.id === m.groupId)
  return !gr?.is_hidden || mockGroups().members.some((x) => x.group_id === m.groupId && x.member_id === viewer)
}
function mockAuthor(id: string): MoimAuthor {
  return { kind: 'real', id, name: mockPerson(id).name, avatarUrl: null }
}
/** Attendee/applicant lists show handles only (mirrors moim_get). */
function mockHandleAuthor(id: string): MoimAuthor {
  return { kind: 'real', id, name: `@${mockHandle(id)}`, avatarUrl: null }
}
function mockToMoim(m: MockMoim, viewerId: string): Moim {
  const viewer = me(viewerId)
  const mine = m.rsvps.find((r) => r.memberId === viewer)
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    mode: m.mode,
    venueName: m.venueName,
    startsAt: m.startsAt,
    timeTbd: Boolean(m.timeTbd),
    threadPostId: m.threadPostId ?? null,
    endsAt: m.endsAt,
    capacity: m.capacity,
    applyDeadline: m.applyDeadline,
    requiresApproval: m.requiresApproval,
    status: m.status,
    feeNote: m.feeNote,
    membersOnly: m.membersOnly,
    questions: m.questions,
    createdAt: m.createdAt,
    host: mockAuthor(m.hostId),
    hostId: m.hostId,
    group: mockGroupRef(m.groupId),
    confirmed: countStatus(m.rsvps, 'confirmed'),
    waitlisted: countStatus(m.rsvps, 'waitlisted'),
    pending: countStatus(m.rsvps, 'pending'),
    isHost: m.hostId === viewer,
    canManage: mockCanManage(m, viewer),
    isGroupMember: m.groupId ? Boolean(mockRoleIn(m.groupId, viewer)) : null,
    myRsvp: mine
      ? { id: mine.id, status: mine.status, answers: mine.answers, note: mine.note, createdAt: mine.createdAt, position: waitlistPosition(m.rsvps, mine.id) }
      : null,
  }
}
function mockDetail(m: MockMoim, viewerId: string): MoimDetail {
  const base = mockToMoim(m, viewerId)
  const order: Record<RsvpStatus, number> = { pending: 0, waitlisted: 1, confirmed: 2, rejected: 3, cancelled: 3 }
  return {
    ...base,
    private: canSeePrivate(base.canManage, base.myRsvp?.status) ? { venueAddress: m.venueAddress, mapUrl: m.mapUrl, meetingUrl: m.meetingUrl } : null,
    attendees: canSeePrivate(base.canManage, base.myRsvp?.status)
      ? m.rsvps.filter((r) => r.status === 'confirmed').map((r) => ({ ...mockHandleAuthor(r.memberId), memberId: r.memberId }))
      : null,
    announcements: [...m.announcements].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    applicants: base.canManage
      ? [...m.rsvps]
          .sort((a, b) => order[a.status] - order[b.status] || (a.waitlistedAt || a.createdAt).localeCompare(b.waitlistedAt || b.createdAt))
          .map((r) => ({ id: r.id, memberId: r.memberId, status: r.status, answers: r.answers, note: r.note, createdAt: r.createdAt, waitlistedAt: r.waitlistedAt, author: mockHandleAuthor(r.memberId) }))
      : null,
  }
}
function mockFind(id: string, viewerId: string) {
  const m = mockMoims().find((x) => x.id === id)
  if (!m || !mockVisible(m, me(viewerId))) throw new Error('moim_not_found')
  return m
}

/** DEV: the 모임's thread post, like moim_create does in 0083. */
let mockThreadSeq = 0
function mockThreadPost(hostId: string, groupId: string | null, m: Parameters<typeof moimThreadContent>[0], createdAt = new Date().toISOString()): string {
  const id = `post-moim-${Date.now()}-${++mockThreadSeq}`
  mockAppendFeedPost({
    id,
    parentId: null,
    rootId: null,
    author: { kind: 'member', id: hostId, name: mockPerson(hostId).name, avatarUrl: null },
    title: null,
    body: moimThreadContent(m),
    linkUrl: null,
    imageUrl: null,
    linkPreview: null,
    tool: null,
    rating: null,
    likeCount: 0,
    likedByMe: false,
    replyCount: 0,
    createdAt,
    agentsAllowed: false,
    isNickname: false,
    groupId,
  })
  return id
}
function mockSetThreadBody(postId: string, body: string) {
  const p = mockFeedPost(postId)
  if (p) p.body = body
}
/** DEV: invites land in the mock bell. */
const gi = globalThis as unknown as { __aisubalMoimInvites?: Array<{ moimId: string; memberId: string; by: string }> }
export function mockMoimInvites() {
  return (gi.__aisubalMoimInvites ??= [])
}

// ------------------------------------------------------------------ reads
export async function listMoim(viewerId: string, tab: MoimTab = 'upcoming', groupId: string | null = null, limit = 50): Promise<Moim[]> {
  if (isMock()) {
    const viewer = me(viewerId)
    const now = Date.now()
    const isPast = (m: MockMoim) => m.status === 'past' || m.status === 'cancelled' || Date.parse(m.startsAt) < now
    return mockMoims()
      .filter((m) => mockVisible(m, viewer) && (!groupId || m.groupId === groupId))
      .filter((m) =>
        tab === 'past' ? isPast(m) : tab === 'mine' ? m.rsvps.some((r) => r.memberId === viewer) : tab === 'hosting' ? mockCanManage(m, viewer) : !isPast(m)
      )
      .sort((a, b) => (tab === 'past' ? b.startsAt.localeCompare(a.startsAt) : a.startsAt.localeCompare(b.startsAt)))
      .slice(0, limit)
      .map((m) => mockToMoim(m, viewerId))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_list', { p_tab: tab, p_group: groupId, p_limit: limit })
  if (error) throw new Error(error.message)
  return ((data || []) as unknown[]).map(fromRow)
}

export async function getMoim(viewerId: string, id: string): Promise<MoimDetail | null> {
  if (isMock()) {
    try {
      return mockDetail(mockFind(id, viewerId), viewerId)
    } catch {
      return null
    }
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_get', { p_id: id })
  if (error) {
    if (error.message.includes('moim_not_found')) return null
    throw new Error(error.message)
  }
  return detailFromRow(data)
}

export async function moimHostOptions(viewerId: string): Promise<MoimGroupRef[]> {
  if (isMock()) {
    const s = mockGroups()
    return s.members
      .filter((m) => m.member_id === me(viewerId) && m.status === 'active' && (m.role === 'owner' || m.role === 'mod'))
      .map((m) => mockGroupRef(m.group_id)!)
      .filter(Boolean)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_host_options')
  if (error) throw new Error(error.message)
  return ((data || []) as MoimGroupRef[]).map((g) => ({ id: g.id, slug: g.slug, name: g.name, emoji: g.emoji ?? null }))
}

/** Next few 모임 for the right rail. */
export async function upcomingMoim(viewerId: string, limit = 3): Promise<Moim[]> {
  return (await listMoim(viewerId, 'upcoming', null, limit)).filter((m) => m.status === 'open')
}

// ------------------------------------------------------------------ writes
export async function createMoim(viewerId: string, input: MoimInput): Promise<string> {
  if (isMock()) {
    const viewer = me(viewerId)
    if (input.groupId) {
      const role = mockRoleIn(input.groupId, viewer)
      if (role !== 'owner' && role !== 'mod') throw new Error('moim_group_forbidden')
    }
    if (!input.title || input.title.trim().length < 2) throw new Error('moim_invalid_title')
    const capacity = input.capacity ?? DEFAULT_CAPACITY
    if (capacity < 1 || capacity > 500) throw new Error('moim_invalid_capacity')
    if (!input.startsAt || Date.parse(input.startsAt) < Date.now()) throw new Error('moim_invalid_time')
    const id = `moim-${Date.now()}`
    const description = (input.description ?? '').trim()
    const threadPostId = mockThreadPost(viewer, input.groupId || null, {
      title: input.title.trim(), startsAt: input.startsAt, timeTbd: Boolean(input.timeTbd), mode: input.mode, venueName: input.venueName || null, description,
    })
    mockMoims().unshift({
      id,
      threadPostId,
      timeTbd: Boolean(input.timeTbd),
      title: input.title.trim(),
      description,
      mode: input.mode,
      venueName: input.venueName || null,
      venueAddress: input.venueAddress || null,
      mapUrl: input.mapUrl || null,
      meetingUrl: input.meetingUrl || null,
      startsAt: input.startsAt,
      endsAt: input.endsAt || null,
      capacity,
      applyDeadline: input.applyDeadline || null,
      requiresApproval: Boolean(input.requiresApproval),
      status: 'open',
      feeNote: input.feeNote || null,
      membersOnly: Boolean(input.groupId && input.membersOnly),
      questions: normalizeQuestions(input.questions),
      hostId: viewer,
      groupId: input.groupId || null,
      createdAt: new Date().toISOString(),
      rsvps: [],
      announcements: [],
    })
    return id
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_create', { p: toPayload(input) })
  if (error) throw new Error(error.message)
  return String(data)
}

export async function updateMoim(viewerId: string, id: string, input: MoimInput): Promise<void> {
  if (isMock()) {
    const m = mockFind(id, viewerId)
    if (!mockCanManage(m, me(viewerId))) throw new Error('moim_forbidden')
    const keep = <T,>(v: T | undefined, cur: T) => (v === undefined ? cur : v)
    const capacity = keep(input.capacity, m.capacity)
    if (capacity < countStatus(m.rsvps, 'confirmed')) throw new Error('moim_capacity_below_confirmed')
    Object.assign(m, {
      title: input.title,
      description: keep(input.description, m.description),
      mode: input.mode,
      venueName: input.venueName || null,
      venueAddress: keep(input.venueAddress, m.venueAddress) || null,
      mapUrl: keep(input.mapUrl, m.mapUrl) || null,
      meetingUrl: keep(input.meetingUrl, m.meetingUrl) || null,
      startsAt: input.startsAt,
      timeTbd: input.timeTbd ?? m.timeTbd ?? false,
      endsAt: keep(input.endsAt, m.endsAt) || null,
      applyDeadline: keep(input.applyDeadline, m.applyDeadline) || null,
      capacity,
      requiresApproval: keep(input.requiresApproval, m.requiresApproval),
      feeNote: keep(input.feeNote, m.feeNote) || null,
      membersOnly: Boolean(m.groupId && keep(input.membersOnly, m.membersOnly)),
      questions: input.questions ? normalizeQuestions(input.questions) : m.questions,
    })
    m.rsvps = promoteWaitlist(m.capacity, m.rsvps).rsvps
    if (m.threadPostId) mockSetThreadBody(m.threadPostId, moimThreadContent({ ...m, timeTbd: Boolean(m.timeTbd) }))
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('moim_update', { p_id: id, p: toPayload(input) })
  if (error) throw new Error(error.message)
}

/**
 * A29: the host @-invites people when opening a 모임. Each gets a 'moim_invite' notification (+ push),
 * subject to their own settings; a group 모임 only reaches that group's members. Returns how many.
 */
export async function inviteMoim(viewerId: string, id: string, handles: string[]): Promise<number> {
  const list = normalizeInvites(handles)
  if (!list.length) return 0
  if (isMock()) {
    const viewer = me(viewerId)
    const m = mockFind(id, viewerId)
    if (!mockCanManage(m, viewer)) throw new Error('moim_forbidden')
    const people = MOCK_PEOPLE.filter((p) => p.id !== viewer && list.includes(mockHandle(p.id).toLowerCase()))
      .filter((p) => !m.groupId || mockRoleIn(m.groupId, p.id))
    const store = mockMoimInvites()
    for (const p of people) if (!store.some((x) => x.moimId === id && x.memberId === p.id)) store.push({ moimId: id, memberId: p.id, by: viewer })
    return people.length
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_invite', { p_id: id, p_handles: list })
  if (error) throw new Error(error.message)
  return Number(data ?? 0)
}

export type MoimInvitee = { handle: string; name: string; avatarUrl: string | null; rsvp: string | null }

/** A35: the current invitees (edit form chips). Managers only. */
export async function listMoimInvitees(viewerId: string, id: string): Promise<MoimInvitee[]> {
  if (isMock()) {
    const viewer = me(viewerId)
    const m = mockFind(id, viewerId)
    if (!mockCanManage(m, viewer)) throw new Error('moim_forbidden')
    return mockMoimInvites()
      .filter((x) => x.moimId === id)
      .map((x) => {
        const p = mockPerson(x.memberId)
        return { handle: mockHandle(x.memberId), name: p?.name ?? mockHandle(x.memberId), avatarUrl: null, rsvp: m.rsvps.find((r) => r.memberId === x.memberId)?.status ?? null }
      })
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_invitees', { p_id: id })
  if (error) throw new Error(error.message)
  return ((data as Array<{ handle: string; name: string; avatar_url: string | null; rsvp: string | null }>) ?? []).map((r) => ({ handle: r.handle, name: r.name, avatarUrl: r.avatar_url, rsvp: r.rsvp }))
}

/**
 * A35: make the invitee list exactly these @handles (edit form). New invitees get the invite
 * notification (+ push); removed ones lose the pending invite quietly; RSVPs are never touched.
 */
export async function setMoimInvites(viewerId: string, id: string, handles: string[]): Promise<{ added: number; removed: number }> {
  const list = normalizeInvites(handles)
  if (isMock()) {
    const viewer = me(viewerId)
    const m = mockFind(id, viewerId)
    if (!mockCanManage(m, viewer)) throw new Error('moim_forbidden')
    const want = MOCK_PEOPLE.filter((p) => p.id !== viewer && list.includes(mockHandle(p.id).toLowerCase())).filter((p) => !m.groupId || mockRoleIn(m.groupId, p.id)).map((p) => p.id)
    const store = mockMoimInvites()
    const before = store.filter((x) => x.moimId === id).map((x) => x.memberId)
    const removed = before.filter((x) => !want.includes(x))
    const added = want.filter((x) => !before.includes(x))
    for (let i = store.length - 1; i >= 0; i--) if (store[i].moimId === id && removed.includes(store[i].memberId)) store.splice(i, 1)
    for (const x of added) store.push({ moimId: id, memberId: x, by: viewer })
    return { added: added.length, removed: removed.length }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_invites_set', { p_id: id, p_handles: list })
  if (error) throw new Error(error.message)
  const d = (data ?? {}) as { added?: number; removed?: number }
  return { added: Number(d.added ?? 0), removed: Number(d.removed ?? 0) }
}

/** A30: feed cards for the 모임 thread posts on screen (moim_get visibility), by post id. */
export async function moimCardsForThreads(viewerId: string, postIds: string[]): Promise<Map<string, TimelineMoim>> {
  const out = new Map<string, TimelineMoim>()
  if (!postIds.length) return out
  if (isMock()) {
    const viewer = me(viewerId)
    for (const m of mockMoims()) {
      if (!m.threadPostId || !postIds.includes(m.threadPostId) || !mockVisible(m, viewer)) continue
      const invited = mockMoimInvites().filter((x) => x.moimId === m.id).length
      out.set(m.threadPostId, toTimelineMoim(mockToMoim(m, viewerId), invited))
    }
    return out
  }
  const ids = postIds.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
  if (!ids.length) return out
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_cards', { p_post_ids: ids })
  if (error) throw new Error(error.message)
  for (const r of (data || []) as Array<Record<string, unknown>>) {
    const m = fromRow(r)
    if (m.threadPostId) out.set(m.threadPostId, toTimelineMoim(m, Number(r.invited ?? 0)))
  }
  return out
}

/**
 * A30: group 모임 threads allowed in the main feed — open, non-hidden group (anyone can read
 * its posts and open the 모임) and not members-only. Everything else stays in its group.
 */
export async function promotedGroupMoimThreads(): Promise<string[]> {
  if (isMock()) {
    const groups = mockGroups().groups
    return mockMoims()
      .filter((m) => {
        const g = m.groupId ? groups.find((x) => x.id === m.groupId) : null
        return Boolean(m.threadPostId && g && g.join_policy === 'open' && !g.is_hidden && !m.membersOnly && (m.status === 'open' || m.status === 'closed'))
      })
      .map((m) => m.threadPostId as string)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_feed_threads')
  if (error) throw new Error(error.message)
  return ((data || []) as string[]).filter((id) => /^[0-9a-f-]{36}$/i.test(id))
}

/** The 모임 a thread post belongs to (for "모임 보기" on /posts/[id]); null when it isn't one or isn't visible. */
export async function moimForThread(postId: string): Promise<{ id: string; title: string } | null> {
  if (isMock()) {
    const m = mockMoims().find((x) => x.threadPostId === postId)
    return m ? { id: m.id, title: m.title } : null
  }
  if (!/^[0-9a-f-]{36}$/i.test(postId)) return null
  const supabase = await sb()
  const { data } = await supabase.from('meetups').select('id, title').eq('thread_post_id', postId).maybeSingle()
  return (data as { id: string; title: string } | null) ?? null
}

export async function setMoimStatus(viewerId: string, id: string, status: 'open' | 'closed' | 'cancelled'): Promise<void> {
  if (isMock()) {
    const m = mockFind(id, viewerId)
    if (!mockCanManage(m, me(viewerId))) throw new Error('moim_forbidden')
    m.status = status
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('moim_set_status', { p_id: id, p_status: status })
  if (error) throw new Error(error.message)
}

export async function applyMoim(viewerId: string, id: string, answers: Record<string, string>, note?: string | null): Promise<{ status: RsvpStatus }> {
  if (isMock()) {
    const viewer = me(viewerId)
    const m = mockFind(id, viewerId)
    const mine = m.rsvps.find((r) => r.memberId === viewer)
    const block = applyBlock(
      { status: m.status, startsAt: m.startsAt, applyDeadline: m.applyDeadline, isHost: m.hostId === viewer, membersOnly: m.membersOnly, groupId: m.groupId },
      { isGroupMember: Boolean(mockRoleIn(m.groupId, viewer)), myStatus: mine?.status ?? null }
    )
    if (block) throw new Error(block)
    if (mine && ['pending', 'confirmed', 'waitlisted'].includes(mine.status)) return { status: mine.status }
    const v = validateAnswers(m.questions, answers)
    if (!v.ok) throw new Error(v.error)
    const status = decideOnApply(m, m.rsvps.filter((r) => r.memberId !== viewer))
    const now = new Date().toISOString()
    m.rsvps = m.rsvps.filter((r) => r.memberId !== viewer)
    m.rsvps.push({ id: `r-${Date.now()}`, memberId: viewer, status, answers: v.answers, note: note || null, createdAt: now, waitlistedAt: status === 'waitlisted' ? now : null, decidedAt: status === 'confirmed' ? now : null })
    return { status }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_apply', { p_id: id, p_answers: answers, p_note: note || null })
  if (error) throw new Error(error.message)
  return { status: (data as { status: RsvpStatus }).status }
}

export async function cancelMoimRsvp(viewerId: string, id: string): Promise<{ promoted: number }> {
  if (isMock()) {
    const viewer = me(viewerId)
    const m = mockFind(id, viewerId)
    const mine = m.rsvps.find((r) => r.memberId === viewer && ['pending', 'confirmed', 'waitlisted'].includes(r.status))
    if (!mine) throw new Error('moim_rsvp_not_found')
    const was = mine.status
    m.rsvps = m.rsvps.map((r) => (r.id === mine.id ? { ...r, status: 'cancelled' as const } : r))
    let promoted: string[] = []
    if (was === 'confirmed') ({ rsvps: m.rsvps, promoted } = promoteWaitlist(m.capacity, m.rsvps))
    return { promoted: promoted.length }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_cancel_rsvp', { p_id: id })
  if (error) throw new Error(error.message)
  return { promoted: Number((data as { promoted: number }).promoted ?? 0) }
}

export async function decideMoimRsvp(viewerId: string, moimId: string, rsvpId: string, action: DecideAction): Promise<{ status: RsvpStatus; promoted: number }> {
  if (isMock()) {
    const m = mockFind(moimId, viewerId)
    if (!mockCanManage(m, me(viewerId))) throw new Error('moim_forbidden')
    const r = decideRsvp(m.capacity, m.rsvps, rsvpId, action)
    if (!r.ok) throw new Error(r.error)
    m.rsvps = r.rsvps
    return { status: r.status, promoted: r.promoted.length }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('moim_decide', { p_rsvp: rsvpId, p_action: action })
  if (error) throw new Error(error.message)
  const d = data as { status: RsvpStatus; promoted: number }
  return { status: d.status, promoted: Number(d.promoted ?? 0) }
}

export async function announceMoim(viewerId: string, id: string, body: string): Promise<void> {
  if (isMock()) {
    const m = mockFind(id, viewerId)
    if (!mockCanManage(m, me(viewerId))) throw new Error('moim_forbidden')
    m.announcements.push({ id: `a-${Date.now()}`, body: body.trim(), createdAt: new Date().toISOString() })
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('moim_announce', { p_id: id, p_body: body })
  if (error) throw new Error(error.message)
}
