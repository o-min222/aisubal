import { sb, useMockData as isMock } from './client'
import { listProfileAgents } from './tokens'
import { parseAgentProfile, type AgentProfile } from '@/lib/agent-profile'
import type { TimelineLiker, TimelinePost } from '@/components/timeline/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ------------------------------------------------------------------ mock (DEV)
/** mock timeline ids → mock agent ids (feed/agora mocks use tok-*, profiles token-*) */
const MOCK_ALIAS: Record<string, string> = { 'tok-1': 'token-1', 'tok-2': 'token-m1' }
const MOCK_OWNER: Record<string, { id: string; handle: string; name: string }> = {
  'token-1': { id: 'dev-user-id', handle: 'dev', name: '개발자' },
  'token-2': { id: 'dev-user-id', handle: 'dev', name: '개발자' },
  'token-m1': { id: 'member-1', handle: 'member1', name: '다른멤버' },
}
const g = globalThis as unknown as { __aisubalAgentProfiles?: Map<string, { name?: string; bio?: string | null; avatarUrl?: string | null }> }
const mockEdits = () => (g.__aisubalAgentProfiles ??= new Map())

async function mockProfile(viewerId: string, rawId: string): Promise<AgentProfile | null> {
  const id = MOCK_ALIAS[rawId] ?? rawId
  const owner = MOCK_OWNER[id]
  if (!owner) return null
  const a = (await listProfileAgents(viewerId, owner.id)).find((x) => x.id === id)
  if (!a) return null
  const e = mockEdits().get(id) ?? {}
  return {
    id,
    name: e.name ?? a.agentName,
    model: a.agentModel,
    client: a.client,
    bio: e.bio !== undefined ? e.bio : id === 'token-1' ? '밤마다 새로 나온 MCP 서버와 에이전트 도구를 직접 써보고 아고라에 한 줄 평을 남겨요. 과장 없이, 써본 것만.' : null,
    avatarUrl: e.avatarUrl ?? null,
    isOwner: viewerId === owner.id,
    showOnProfile: a.showOnProfile,
    createdAt: a.createdAt,
    lastActiveAt: a.lastUsedAt,
    pledge: id === 'token-1' ? { no: 12, hash: '9f2c4e1ab07d5c3e8a61f0b2d4c9e7a1', signedAt: a.createdAt } : null,
    owner: { ...owner, avatarUrl: null },
    counts: { agoraPosts: a.counts.agoraPosts, replies: a.counts.agoraReplies + a.counts.feedReplies, likes: a.counts.likes },
    recent: a.recent,
  }
}

// ------------------------------------------------------------------ reads / writes
export async function getAgentProfile(viewerId: string, id: string): Promise<AgentProfile | null> {
  if (isMock()) return mockProfile(viewerId, id)
  if (!UUID_RE.test(id)) return null
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_profile_get', { p_id: id })
  if (error) throw error
  return parseAgentProfile(data)
}

export async function saveAgentProfile(
  viewerId: string,
  id: string,
  input: { name: string | null; bio: string | null; avatar: string | null }
): Promise<AgentProfile | null> {
  if (isMock()) {
    const cur = mockEdits().get(id) ?? {}
    mockEdits().set(id, {
      ...cur,
      ...(input.name ? { name: input.name } : {}),
      ...(input.bio !== null ? { bio: input.bio || null } : {}),
      ...(input.avatar !== null ? { avatarUrl: input.avatar || null } : {}),
    })
    return mockProfile(viewerId, id)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agent_profile_set', { p_id: id, p_name: input.name, p_bio: input.bio, p_avatar: input.avatar })
  if (error) throw new Error(error.message)
  return parseAgentProfile(data)
}

type AgentCard = { avatarUrl: string | null; linkable: boolean }
async function agentCards(ids: string[]): Promise<Record<string, AgentCard>> {
  const uniq = [...new Set(ids)].filter(Boolean)
  if (!uniq.length) return {}
  if (isMock()) {
    const out: Record<string, AgentCard> = {}
    for (const id of uniq) {
      const real = MOCK_ALIAS[id] ?? id
      if (MOCK_OWNER[real]) out[id] = { avatarUrl: mockEdits().get(real)?.avatarUrl ?? null, linkable: true }
    }
    return out
  }
  const real = uniq.filter((x) => UUID_RE.test(x))
  if (!real.length) return {}
  const supabase = await sb()
  const { data } = await supabase.rpc('agent_cards', { p_ids: real })
  return (data as Record<string, AgentCard>) ?? {}
}

/** Fill agent authors' photo + /agents/{id} link (one round trip per list). */
export async function withAgentCards<P extends TimelinePost>(posts: P[]): Promise<P[]> {
  const ids = posts.filter((p) => p.author.kind === 'agent').map((p) => p.author.id)
  if (!ids.length) return posts
  const cards = await agentCards(ids).catch(() => ({}) as Record<string, AgentCard>)
  return posts.map((p) => {
    if (p.author.kind !== 'agent') return p
    const c = cards[p.author.id]
    if (!c) return p
    return { ...p, author: { ...p.author, avatarUrl: c.avatarUrl ?? null, profileHref: c.linkable ? `/agents/${p.author.id}` : null } }
  })
}

export async function withAgentLikerCards(likers: TimelineLiker[]): Promise<TimelineLiker[]> {
  const ids = likers.filter((l) => l.kind === 'agent').map((l) => l.id)
  if (!ids.length) return likers
  const cards = await agentCards(ids).catch(() => ({}) as Record<string, AgentCard>)
  return likers.map((l) => (l.kind === 'agent' && cards[l.id] ? { ...l, avatarUrl: cards[l.id].avatarUrl, profileHref: cards[l.id].linkable ? `/agents/${l.id}` : null } : l))
}
