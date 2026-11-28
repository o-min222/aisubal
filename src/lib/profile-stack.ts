/**
 * Profile "stack" shown on the unified profile card: 활용하는 AI, 구독 중인 서비스,
 * 스킬·플러그인·MCP, and 내 에이전트. Pure (no IO) so it is unit-tested.
 */
import type { LinkVisibility } from '@/lib/profile-rules'
import type { ToolboxType } from '@/lib/supabase/types'
import { msg } from '@/i18n/translate'

export type StackGroup = 'ai' | 'subs' | 'skills'
export type StackEntryRef = { id: string; slug: string; name: string; iconUrl: string | null; type?: ToolboxType | string }
export type StackItem = { label: string; entry: StackEntryRef | null; /** owner only: per-chip lock (null = follow the group) */ visibility?: LinkVisibility | null }
/** null = hidden from this viewer */
export type StackGroupData = { visibility: LinkVisibility | null; items: StackItem[] } | null

const AGENT_PLATFORMS = [
  { id: 'grok_bot', label: 'Grok Bot', short: 'G', color: '#111111' },
  { id: 'claude_code', label: 'Claude Code', short: 'C', color: '#d97757' },
  { id: 'custom_gpt', label: 'Custom GPT', short: 'GPT', color: '#10a37f' },
  { id: 'n8n', label: 'n8n', short: 'n8n', color: '#ea4b71' },
  { id: 'own_build', label: msg('직접 만든 에이전트'), short: '⚙', color: '#555555' },
  { id: 'cursor', label: 'Cursor', short: 'Cu', color: '#222222' },
  { id: 'codex', label: 'Codex', short: 'Cx', color: '#0f766e' },
  { id: 'chatgpt', label: 'ChatGPT', short: 'GPT', color: '#10a37f' },
  { id: 'claude', label: 'Claude', short: 'C', color: '#d97757' },
  { id: 'gemini', label: 'Gemini', short: 'Ge', color: '#4f7cff' },
  { id: 'other', label: msg('기타'), short: '•', color: '#888888' },
] as const
export type AgentPlatform = (typeof AGENT_PLATFORMS)[number]['id']
export const platformOf = (id: string | null | undefined) => AGENT_PLATFORMS.find((p) => p.id === id) ?? AGENT_PLATFORMS[AGENT_PLATFORMS.length - 1]

/** Connected (token) activity merged in for display; hour-rounded for others. */
export type AgentConnection = { tokenId: string; lastActiveAt: string | null; activityCount: number; href: string; avatarUrl?: string | null; brand?: string | null }
export type MemberAgent = { id: string; name: string; platform: AgentPlatform; model: string; role: string; url: string; visibility: LinkVisibility | null; connected: AgentConnection | null }

export const STACK_LIMIT = 20

/** Quick picks for the pickers (free text is always allowed too). */
export const AI_SUGGESTIONS = ['Claude', 'ChatGPT', 'Gemini', 'Grok', 'Cursor', 'Perplexity', 'GitHub Copilot', 'Claude Code', 'Codex', 'Midjourney', 'NotebookLM', 'v0']
/** Paid individual plans only (no free / team / enterprise). Grouped by vendor; current official names, plus still-active legacy names. */
export const SUB_SUGGESTIONS = [
  'ChatGPT Go', 'ChatGPT Plus', 'ChatGPT Pro',
  'Claude Pro', 'Claude Max', 'Claude Ultra',
  'X Subscription Plus', 'X Subscription Premium', 'X Subscription Super', 'X Subscription Ultra',
  'Cursor Pro', 'Cursor Pro+', 'Cursor Ultra',
  'Google AI Plus', 'Google AI Pro', 'Google AI Ultra',
  'SuperGrok', 'SuperGrok Heavy',
  'Perplexity Pro', 'Perplexity Max',
  'GitHub Copilot Pro', 'GitHub Copilot Pro+', 'GitHub Copilot Max',
  'Midjourney Basic', 'Midjourney Standard', 'Midjourney Pro', 'Midjourney Mega',
  'Devin Pro', 'Devin Max',
  'ZCRE (지크)',
] as const


/**
 * Search-only aliases (not shown as their own chips). Renamed or bilingual names still
 * surface the official chip — e.g. "cursor plus" → X Subscription Plus, "지크" → ZCRE (지크).
 */
export const SUB_SUGGESTION_ALIASES: Record<string, readonly string[]> = {
  'ChatGPT Go': ['GPT Go', '챗지피티 고', '챗GPT 고'],
  'ChatGPT Plus': ['GPT Plus', '챗지피티 플러스', '챗GPT 플러스'],
  'ChatGPT Pro': ['GPT Pro', 'ChatGPT Pro 100', 'ChatGPT Pro 200', 'ChatGPT Pro 500', '챗지피티 프로', '챗GPT 프로'],
  'Claude Pro': ['클로드 프로', 'Anthropic Pro'],
  'Claude Max': ['클로드 맥스', 'Anthropic Max'],
  'Claude Ultra': ['클로드 울트라', 'Claude Max 20x', 'Anthropic Ultra'],
  'X Subscription Plus': ['The X Subscription Plus', 'Cursor Plus', 'Grok Plus', 'X Plus', '커서 플러스', '그록 플러스'],
  'X Subscription Premium': ['The X Subscription Premium', 'Cursor Premium', 'X Premium', '커서 프리미엄'],
  'X Subscription Super': ['The X Subscription Super', 'Cursor Super', 'X Super', '커서 슈퍼'],
  'X Subscription Ultra': ['The X Subscription Ultra', 'X Ultra', '커서 울트라'],
  'Cursor Pro': ['커서 프로'],
  'Cursor Pro+': ['Cursor Pro Plus', '커서 프로 플러스', '커서 프로+'],
  'Cursor Ultra': ['커서 울트라'],
  'Google AI Plus': ['Gemini Plus', 'Google One AI Plus', '제미나이 플러스', '구글 AI 플러스'],
  'Google AI Pro': ['Gemini Advanced', 'Gemini Pro', '제미나이 프로', '구글 AI 프로'],
  'Google AI Ultra': ['Google AI Ultra 5x', 'Google AI Ultra 20x', 'Gemini Ultra', '제미나이 울트라', '구글 AI 울트라'],
  'SuperGrok': ['Grok', '그록', '슈퍼그록'],
  'SuperGrok Heavy': ['Grok Heavy', '슈퍼그록 헤비', '그록 헤비'],
  'Perplexity Pro': ['퍼플렉시티 프로'],
  'Perplexity Max': ['퍼플렉시티 맥스'],
  'GitHub Copilot Pro': ['Copilot Pro', '코파일럿 프로'],
  'GitHub Copilot Pro+': ['Copilot Pro+', 'Copilot Pro Plus', '코파일럿 프로+', '코파일럿 프로 플러스'],
  'GitHub Copilot Max': ['Copilot Max', '코파일럿 맥스'],
  'Midjourney Basic': ['미드저니 베이직'],
  'Midjourney Standard': ['미드저니 스탠다드'],
  'Midjourney Pro': ['미드저니 프로'],
  'Midjourney Mega': ['미드저니 메가'],
  'Devin Pro': ['Windsurf Pro', '데빈 프로', '윈드서프 프로'],
  'Devin Max': ['Windsurf Max', '데빈 맥스', '윈드서프 맥스'],
  'ZCRE (지크)': ['ZCRE', '지크'],
}

/** Case/space-insensitive key used by stack items and the subscription picker. */
const stackNorm = (s: string) => s.toLowerCase().replace(/[\s_\-·.]+/g, '')

/** True when a suggestion chip should appear for this search term (label or alias). */
export function suggestionMatches(label: string, term: string, aliases: Record<string, readonly string[]> = SUB_SUGGESTION_ALIASES): boolean {
  const t = stackNorm(term)
  if (!t) return true
  if (stackNorm(label).includes(t)) return true
  return (aliases[label] ?? []).some((a) => stackNorm(a).includes(t))
}

/** catalog types that count as 스킬·플러그인·MCP (from '사용 중' tool usage) */
export const SKILL_TYPES: ReadonlyArray<string> = ['agent_skill', 'mcp_server', 'cli_tool', 'cursor_rules', 'prompt']

export const STACK_GROUP_LABEL: Record<StackGroup, string> = {
  ai: msg('활용하는 AI'),
  subs: msg('구독 중인 서비스'),
  skills: msg('스킬·플러그인·MCP'),
}

/** Clean + de-duplicate one group's items (case/space-insensitive), cap at the limit; chips always follow the group's visibility. */
export function cleanStackItems(
  items: Array<{ label: string; entryId?: string | null; visibility?: unknown }>,
  limit = STACK_LIMIT,
): Array<{ label: string; entryId: string | null; visibility: LinkVisibility | null }> {
  const seen = new Set<string>()
  const out: Array<{ label: string; entryId: string | null; visibility: LinkVisibility | null }> = []
  for (const it of items) {
    const label = (it.label || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!label) continue
    const key = it.entryId ? `id:${it.entryId}` : `t:${stackNorm(label)}`
    if (seen.has(key) || seen.has(`t:${stackNorm(label)}`)) continue
    seen.add(key)
    seen.add(`t:${stackNorm(label)}`)
    // A41: no per-chip visibility any more; every chip follows its group's setting
    out.push({ label, entryId: it.entryId || null, visibility: null })
    if (out.length >= limit) break
  }
  return out
}

/** Connect-wizard client → the platform badge used on profile cards. */
const CLIENT_PLATFORM: Record<string, AgentPlatform> = {
  claude_desktop: 'claude',
  claude_code: 'claude_code',
  chatgpt: 'chatgpt',
  chatgpt_desktop: 'chatgpt',
  cursor: 'cursor',
  codex: 'codex',
  grok_bot: 'grok_bot',
  custom: 'other',
}

type ConnectedLike = {
  id: string
  agentName: string
  agentModel: string | null
  brand?: string | null
  client: string | null
  lastUsedAt: string | null
  showOnProfile: boolean
  avatarUrl?: string | null
  counts: { agoraPosts: number; agoraReplies: number; feedReplies: number; likes: number }
}

/**
 * Profile agents = connected agents only (내 에이전트 is the single place to manage
 * them). Others see only agents shown on the profile, with hour-rounded activity.
 */
export function agentsFromConnected(memberId: string, connected: ConnectedLike[], own: boolean): MemberAgent[] {
  return connected
    .filter((c) => own || c.showOnProfile)
    .map((c) => ({
      id: c.id,
      name: c.agentName,
      platform: CLIENT_PLATFORM[c.client ?? ''] ?? 'other',
      model: c.agentModel ?? '',
      role: '',
      url: '',
      visibility: own ? (c.showOnProfile ? 'members' : 'private') : null,
      connected: {
        tokenId: c.id,
        lastActiveAt: own ? c.lastUsedAt : hourRounded(c.lastUsedAt),
        activityCount: c.counts.agoraPosts + c.counts.agoraReplies + c.counts.feedReplies + c.counts.likes,
        href: `/agents/${c.id}`,
        avatarUrl: c.avatarUrl ?? null,
        brand: c.brand ?? null,
      },
    }))
}

/**
 * A90: 스킬·플러그인·MCP order. Saved skills rows are free-text extras (no entry) and order
 * anchors for catalog tools marked '사용 중' (entry set). Anchors whose tool isn't in use any
 * more (or that this viewer can't see) drop out; in-use tools without an anchor come first,
 * as before A90.
 */
export function mergeSkillOrder<I extends { entry: { id: string } | null }>(saved: I[], used: I[]): I[] {
  const usedById = new Map(used.map((u) => [u.entry!.id, u]))
  const placed = new Set<string>()
  const ordered: I[] = []
  for (const s of saved) {
    if (!s.entry) ordered.push(s)
    else if (usedById.has(s.entry.id) && !placed.has(s.entry.id)) {
      ordered.push(usedById.get(s.entry.id)!)
      placed.add(s.entry.id)
    }
  }
  return [...used.filter((u) => !placed.has(u.entry!.id)), ...ordered]
}

/** A90: the skills row to save: extras as text, in-use tools as anchors; over the cap, trailing anchors go first. */
export function skillsPayload(items: Array<{ label: string; entryId: string | null; used?: boolean }>, limit = STACK_LIMIT): Array<{ label: string; entryId: string | null }> {
  const out = items.map((i) => ({ label: i.label, entryId: i.used ? i.entryId : null }))
  for (let k = out.length - 1; out.length > limit && k >= 0; k--) if (out[k].entryId) out.splice(k, 1)
  return out.slice(0, limit)
}

/** A90: '내가 쓰는 것' order — not-yet-placed first (newest first), then by position. */
export function sortUsage<T extends { created_at: string; position?: number | null }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const pa = a.position ?? null, pb = b.position ?? null
    if (pa === null && pb !== null) return -1
    if (pb === null && pa !== null) return 1
    if (pa !== null && pb !== null && pa !== pb) return pa - pb
    return b.created_at.localeCompare(a.created_at)
  })
}

/** Move one item in a list (reorder by drag or ‹ ›). */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length || to < 0 || to >= list.length) return list
  const next = [...list]
  const [x] = next.splice(from, 1)
  next.splice(to, 0, x)
  return next
}

/** Visible chips + how many are folded into '+N'. */
export function chipOverflow<T>(items: T[], max: number): { shown: T[]; more: number } {
  if (items.length <= max) return { shown: items, more: 0 }
  return { shown: items.slice(0, Math.max(0, max - 1)), more: items.length - Math.max(0, max - 1) }
}

/** Round an ISO time down to the hour (others see coarse activity only). */
export function hourRounded(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}
