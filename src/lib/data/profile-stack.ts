import type { LinkVisibility } from '@/lib/profile-rules'
import {
  SKILL_TYPES,
  agentsFromConnected,
  mergeSkillOrder,
  type MemberAgent,
  type StackGroup,
  type StackGroupData,
  type StackItem,
} from '@/lib/profile-stack'
import { listMemberTools } from './tools'
import { listProfileAgents } from './tokens'
import { sb, isMock } from './client'

/**
 * Profile stack (0016, 0026): 활용하는 AI / 구독 / 스킬 extras (per-chip visibility)
 * + agents derived from 내 에이전트 (connected agents shown on the profile).
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

export type StackSaveItem = { label: string; entryId: string | null; visibility?: LinkVisibility | null }

export type StackSaveInput = {
  ai: StackSaveItem[]
  subs: StackSaveItem[]
  skills: StackSaveItem[]
  vis: Record<StackGroup, LinkVisibility>
}

type RawGroup = { visibility: LinkVisibility | null; items: StackItem[] } | null
type RawStack = { ai: RawGroup; subs: RawGroup; skills: RawGroup }

type MockStack = { save: StackSaveInput }
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
  },
  'member-1': {
    save: {
      ai: ['Claude', 'ChatGPT', 'Perplexity'].map((label) => ({ label, entryId: null })),
      subs: ['Claude Pro'].map((label) => ({ label, entryId: null })),
      skills: [],
      vis: { ai: 'members', subs: 'members', skills: 'members' },
    },
  },
}

function mockRaw(viewerId: string, memberId: string): RawStack {
  const own = viewerId === memberId
  const s = mockStore().get(memberId) ?? MOCK_DEFAULTS[memberId]
  const can = (v: LinkVisibility) => own || v === 'members' // mock: no friends
  const grp = (k: StackGroup): RawGroup => {
    if (!s) return { visibility: own ? 'members' : null, items: [] }
    const vis = s.save.vis[k]
    return can(vis)
      ? { visibility: own ? vis : null, items: s.save[k].filter((i) => !i.visibility || can(i.visibility)).map((i) => ({ label: i.label, entry: i.entryId ? { id: i.entryId, slug: '', name: i.label, iconUrl: null } : null, visibility: own ? (i.visibility ?? null) : null })) }
      : null
  }
  return {
    ai: grp('ai'),
    subs: grp('subs'),
    skills: grp('skills'),
  }
}

export async function getProfileStack(viewerId: string, memberId: string): Promise<ProfileStack> {
  const own = viewerId === memberId
  let raw: RawStack
  if (isMock()) raw = mockRaw(viewerId, memberId)
  else {
    const supabase = await sb()
    const { data, error } = await supabase.rpc('profile_stack', { p_member: memberId })
    if (error || !data) raw = { ai: null, subs: null, skills: null }
    else raw = data as RawStack
  }
  const [tools, connected] = await Promise.all([
    raw.skills ? listMemberTools(memberId).catch(() => []) : Promise.resolve([]),
    listProfileAgents(viewerId, memberId).catch(() => []),
  ])
  const skillTools: StackItem[] = tools
    .filter((t) => SKILL_TYPES.includes(t.type))
    .map((t) => ({ label: t.name, entry: { id: t.id, slug: t.slug, name: t.name, iconUrl: t.icon_url, type: t.type } }))
  const saved = raw.skills?.items ?? []
  return {
    ai: raw.ai,
    subs: raw.subs,
    // A90: one owner-chosen order across '사용 중' tools and free-text extras
    skills: raw.skills ? { visibility: raw.skills.visibility, items: mergeSkillOrder(saved, skillTools) } : null,
    skillExtras: saved.filter((i) => !i.entry).map((i) => i.label),
    agents: agentsFromConnected(memberId, connected, own),
  }
}

export async function saveProfileStack(memberId: string, input: StackSaveInput): Promise<void> {
  if (isMock()) {
    const cur = mockStore().get(memberId) ?? MOCK_DEFAULTS[memberId] ?? { save: input }
    mockStore().set(memberId, { ...cur, save: input })
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('profile_stack_save', { p: input })
  if (error) throw new Error(error.message)
}

