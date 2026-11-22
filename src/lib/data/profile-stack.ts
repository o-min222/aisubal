import type { LinkVisibility } from '@/lib/profile-rules'
import {
  SKILL_TYPES,
  hourRounded,
  matchConnected,
  type MemberAgent,
  type MemberAgentInput,
  type StackGroup,
  type StackGroupData,
  type StackItem,
} from '@/lib/profile-stack'
import { listMemberTools } from './tools'
import { listProfileAgents, type ProfileAgent } from './tokens'
import { sb, useMockData as isMock } from './client'

/**
 * Profile stack (0016): 활용하는 AI / 구독 / 스킬 extras + 내 에이전트.
 * Visibility is enforced in SQL (profile_stack); catalog skills come from
 * the existing '사용 중' tool usage (tool_users), one source of truth.
 */
export type ProfileStack = {
  ai: StackGroupData
  subs: StackGroupData
  /** tool_users skills/plugins/MCP + free-text extras */
  skills: StackGroupData
  /** free-text extras only (owner editor) */
  skillExtras: string[]
  agents: MemberAgent[]
}

export type StackSaveInput = {
  ai: Array<{ label: string; entryId: string | null }>
  subs: Array<{ label: string; entryId: string | null }>
  skills: Array<{ label: string; entryId: string | null }>
  vis: Record<StackGroup, LinkVisibility>
}

type RawGroup = { visibility: LinkVisibility | null; items: StackItem[] } | null
type RawStack = { ai: RawGroup; subs: RawGroup; skills: RawGroup; agents: Array<Omit<MemberAgent, 'connected'>> }

type MockStack = { save: StackSaveInput; agents: MemberAgentInput[] }
const g = globalThis as unknown as { __aisubalStack?: Map<string, MockStack> }
const mockStore = (): Map<string, MockStack> => (g.__aisubalStack ??= new Map())

const MOCK_DEFAULTS: Record<string, MockStack> = {
  'dev-user-id': {
    save: {
      ai: ['Claude', 'ChatGPT', 'Gemini', 'Cursor', 'Grok'].map((label) => ({ label, entryId: null })),
      subs: ['Claude Max', 'ChatGPT Plus', 'Cursor Pro'].map((label) => ({ label, entryId: null })),
      skills: [{ label: 'Raycast AI', entryId: null }],
      vis: { ai: 'members', subs: 'friends', skills: 'members' },
    },
    agents: [
      { name: 'Claude Code', platform: 'claude_code', model: 'claude-sonnet-4.5', role: '코드 리뷰·리팩터링', url: '', visibility: 'members' },
      { name: 'Grok Bot', platform: 'grok_bot', model: '', role: '일정·메일 비서', url: '', visibility: 'members' },
      { name: '뉴스 요약봇', platform: 'n8n', model: 'gpt-4.1-mini', role: '매일 아침 AI 뉴스 요약', url: 'https://n8n.example.com', visibility: 'friends' },
    ],
  },
  'member-1': {
    save: {
      ai: ['Claude', 'ChatGPT', 'Perplexity'].map((label) => ({ label, entryId: null })),
      subs: ['Claude Pro'].map((label) => ({ label, entryId: null })),
      skills: [],
      vis: { ai: 'members', subs: 'members', skills: 'members' },
    },
    agents: [{ name: 'Claude Code', platform: 'claude_code', model: 'claude-opus-4', role: '사이드 프로젝트 개발', url: '', visibility: 'members' }],
  },
}

function mockRaw(viewerId: string, memberId: string): RawStack {
  const own = viewerId === memberId
  const s = mockStore().get(memberId) ?? MOCK_DEFAULTS[memberId]
  const can = (v: LinkVisibility) => own || v === 'members' // mock: no friends
  const grp = (k: StackGroup): RawGroup => {
    if (!s) return { visibility: own ? 'members' : null, items: [] }
    const vis = s.save.vis[k]
    return can(vis) ? { visibility: own ? vis : null, items: s.save[k].map((i) => ({ label: i.label, entry: null })) } : null
  }
  return {
    ai: grp('ai'),
    subs: grp('subs'),
    skills: grp('skills'),
    agents: (s?.agents ?? [])
      .map((a, i) => ({ ...a, id: `mock-agent-${i}`, visibility: own ? a.visibility : null, _v: a.visibility }))
      .filter((a) => can(a._v))
      .map(({ _v, ...a }) => (void _v, a)),
  }
}

/** Match manual agents to token-connected ones (respecting show_on_profile, hour-rounded for others). */
export function mergeAgents(memberId: string, agents: RawStack['agents'], connected: ProfileAgent[], own: boolean): MemberAgent[] {
  return agents.map((a) => {
    const c = matchConnected(a.name, connected.filter((x) => own || x.showOnProfile))
    return {
      ...a,
      role: a.role ?? '',
      url: a.url ?? '',
      model: a.model || c?.agentModel || '',
      connected: c
        ? {
            tokenId: c.id,
            lastActiveAt: own ? c.lastUsedAt : hourRounded(c.lastUsedAt),
            activityCount: c.counts.agoraPosts + c.counts.agoraReplies + c.counts.feedReplies + c.counts.likes,
            href: `/members/${own ? 'me' : memberId}#agents`,
          }
        : null,
    }
  })
}

export async function getProfileStack(viewerId: string, memberId: string): Promise<ProfileStack> {
  const own = viewerId === memberId
  let raw: RawStack
  if (isMock()) raw = mockRaw(viewerId, memberId)
  else {
    const supabase = await sb()
    const { data, error } = await supabase.rpc('profile_stack', { p_member: memberId })
    if (error || !data) raw = { ai: null, subs: null, skills: null, agents: [] }
    else raw = data as RawStack
  }
  const [tools, connected] = await Promise.all([
    raw.skills ? listMemberTools(memberId).catch(() => []) : Promise.resolve([]),
    raw.agents.length ? listProfileAgents(viewerId, memberId).catch(() => []) : Promise.resolve([]),
  ])
  const skillTools: StackItem[] = tools
    .filter((t) => SKILL_TYPES.includes(t.type))
    .map((t) => ({ label: t.name, entry: { id: t.id, slug: t.slug, name: t.name, iconUrl: t.icon_url, type: t.type } }))
  const extras = raw.skills?.items ?? []
  return {
    ai: raw.ai,
    subs: raw.subs,
    skills: raw.skills ? { visibility: raw.skills.visibility, items: [...skillTools, ...extras] } : null,
    skillExtras: extras.map((i) => i.label),
    agents: mergeAgents(memberId, raw.agents || [], connected, own),
  }
}

export async function saveProfileStack(memberId: string, input: StackSaveInput): Promise<void> {
  if (isMock()) {
    const cur = mockStore().get(memberId) ?? MOCK_DEFAULTS[memberId] ?? { save: input, agents: [] }
    mockStore().set(memberId, { ...cur, save: input })
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('profile_stack_save', { p: input })
  if (error) throw new Error(error.message)
}

export async function saveMemberAgents(memberId: string, agents: MemberAgentInput[]): Promise<void> {
  if (isMock()) {
    const cur = mockStore().get(memberId) ?? MOCK_DEFAULTS[memberId] ?? { save: { ai: [], subs: [], skills: [], vis: { ai: 'members', subs: 'members', skills: 'members' } }, agents }
    mockStore().set(memberId, { ...cur, agents })
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('member_agents_save', { p: agents })
  if (error) throw new Error(error.message)
}
