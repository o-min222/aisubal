/**
 * DEV-only (DEV_BYPASS_AUTH) people directory + social graph seed, so the
 * follow/friend/graph/group screens are reviewable without a database.
 */
import type { Relation, FriendState } from './social-rules'

export const DEV_ID = 'dev-user-id'

export type MockPerson = { id: string; name: string; bio: string; invitedBy: string | null; joinedAt: string; handle?: string }

const BASE: MockPerson[] = [
  { id: 'member-1', name: '에이전트덕후', bio: 'AI 에이전트로 사이드 프로젝트 중', invitedBy: null, joinedAt: '2026-09-01T00:00:00Z' },
  { id: DEV_ID, name: '개발자', bio: '로컬 리뷰용 시드 멤버', invitedBy: 'member-1', joinedAt: '2026-10-01T00:00:00Z' },
  { id: 'member-2', name: '프롬프트수집가', bio: 'PM · 프롬프트 수집가', invitedBy: 'member-1', joinedAt: '2026-10-02T00:00:00Z' },
  { id: 'member-3', name: 'MCP장인', bio: '백엔드 · MCP 서버 만드는 중', invitedBy: 'member-1', joinedAt: '2026-10-03T00:00:00Z' },
  { id: 'member-4', name: '픽셀마녀', bio: '디자이너 · 이미지 생성 실험', invitedBy: DEV_ID, joinedAt: '2026-10-05T00:00:00Z' },
  { id: 'member-5', name: '데이터하늘', bio: '데이터 분석 자동화', invitedBy: DEV_ID, joinedAt: '2026-10-06T00:00:00Z' },
  { id: 'member-6', name: '새벽CTO', bio: '스타트업 CTO', invitedBy: DEV_ID, joinedAt: '2026-10-07T00:00:00Z' },
  { id: 'member-7', name: '노코드요정', bio: '마케터 · 노코드', invitedBy: 'member-2', joinedAt: '2026-10-08T00:00:00Z' },
  { id: 'member-8', name: 'Swift러버', bio: 'iOS 개발', invitedBy: 'member-3', joinedAt: '2026-10-09T00:00:00Z' },
]

const SURNAMES = ['졸린', '빠른', '조용한', '반짝', '느긋한', '용감한', '수줍은', '배고픈', '똑똑한', '야행성']
const GIVEN = ['고양이', '토큰', '라마', '펭귄', '코더', '여우', '수달', '로봇', '판다', '부엉이', '해달', '다람쥐', '오리', '곰', '벌새']

function synth(): MockPerson[] {
  const out: MockPerson[] = []
  // member-5 invited many people → exercises paginated lazy expansion (12 per page)
  for (let i = 0; i < 17; i++) {
    out.push({ id: `mock-5-${i}`, name: SURNAMES[i % 10] + GIVEN[i % 15], bio: '', invitedBy: 'member-5', joinedAt: `2026-10-${String(10 + (i % 18)).padStart(2, '0')}T0${i % 10}:00:00Z` })
  }
  for (let i = 0; i < 4; i++) {
    out.push({ id: `mock-4-${i}`, name: SURNAMES[(i + 3) % 10] + GIVEN[(i + 5) % 15], bio: '', invitedBy: 'member-4', joinedAt: `2026-10-2${i}T00:00:00Z` })
  }
  for (let i = 0; i < 3; i++) {
    out.push({ id: `mock-40-${i}`, name: SURNAMES[(i + 6) % 10] + GIVEN[(i + 9) % 15], bio: '', invitedBy: 'mock-4-0', joinedAt: `2026-11-0${i + 1}T00:00:00Z` })
  }
  for (let i = 0; i < 2; i++) {
    out.push({ id: `mock-400-${i}`, name: SURNAMES[(i + 1) % 10] + GIVEN[(i + 12) % 15], bio: '', invitedBy: 'mock-40-0', joinedAt: `2026-11-1${i}T00:00:00Z` })
  }
  return out
}

export const MOCK_PEOPLE: MockPerson[] = [...BASE, ...synth()]
const HANDLES: Record<string, string> = { 'member-1': 'agent_nerd', 'member-2': 'prompt_jar', 'member-3': 'mcp_smith', 'member-4': 'pixel_witch', 'member-5': 'data_sky', 'member-6': 'dawn_cto', 'member-7': 'nocode_fairy', 'member-8': 'swift_lover' }
/** Mock @handle (self-made identity, never a real name). */
export function mockHandle(id: string): string {
  if (id === DEV_ID || id === 'dev-user-id') return 'dev'
  return HANDLES[id] ?? id.replace(/[^a-z0-9]+/g, '_').slice(0, 20)
}
export function mockPerson(id: string): MockPerson {
  return MOCK_PEOPLE.find((p) => p.id === id) || { id, name: id, bio: '', invitedBy: null, joinedAt: '2026-10-01T00:00:00Z' }
}

type SocialState = {
  follows: Array<{ follower: string; followee: string; at: string }>
  friendships: Array<{ requester: string; addressee: string; status: 'pending' | 'accepted' | 'declined'; at: string; respondedAt: string | null }>
}
const g = globalThis as unknown as { __aisubalSocial?: SocialState }

export function mockSocial(): SocialState {
  if (g.__aisubalSocial) return g.__aisubalSocial
  const now = Date.now()
  const at = (h: number) => new Date(now - h * 3600_000).toISOString()
  g.__aisubalSocial = {
    follows: [
      { follower: DEV_ID, followee: 'member-1', at: at(80) },
      { follower: 'member-1', followee: DEV_ID, at: at(70) }, // 맞팔 (not friends)
      { follower: DEV_ID, followee: 'member-2', at: at(60) },
      { follower: 'member-2', followee: DEV_ID, at: at(50) },
      { follower: DEV_ID, followee: 'member-4', at: at(40) },
      { follower: 'member-3', followee: DEV_ID, at: at(30) },
      { follower: 'member-5', followee: DEV_ID, at: at(20) },
      { follower: 'member-2', followee: 'member-1', at: at(10) },
    ],
    friendships: [
      { requester: 'member-2', addressee: DEV_ID, status: 'accepted', at: at(55), respondedAt: at(54) },
      { requester: DEV_ID, addressee: 'member-5', status: 'accepted', at: at(45), respondedAt: at(44) },
      { requester: 'member-3', addressee: DEV_ID, status: 'pending', at: at(5), respondedAt: null },
      { requester: DEV_ID, addressee: 'member-6', status: 'pending', at: at(3), respondedAt: null },
    ],
  }
  return g.__aisubalSocial
}

export function mockFriendState(viewer: string, other: string): FriendState {
  const f = mockSocial().friendships.find(
    (x) => (x.requester === viewer && x.addressee === other) || (x.requester === other && x.addressee === viewer)
  )
  if (!f || f.status === 'declined') return 'none'
  if (f.status === 'accepted') return 'friends'
  return f.requester === viewer ? 'pending_out' : 'pending_in'
}

export function mockRelation(viewer: string, other: string): Relation {
  const s = mockSocial()
  return {
    isMe: viewer === other,
    iFollow: s.follows.some((f) => f.follower === viewer && f.followee === other),
    followsMe: s.follows.some((f) => f.follower === other && f.followee === viewer),
    friend: mockFriendState(viewer, other),
  }
}
