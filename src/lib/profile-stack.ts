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

export const AGENT_PLATFORMS = [
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
export const AGENT_PLATFORM_IDS = AGENT_PLATFORMS.map((p) => p.id) as AgentPlatform[]
export const platformOf = (id: string | null | undefined) => AGENT_PLATFORMS.find((p) => p.id === id) ?? AGENT_PLATFORMS[AGENT_PLATFORMS.length - 1]

/** Connected (token) activity merged in for display; hour-rounded for others. */
export type AgentConnection = { tokenId: string; lastActiveAt: string | null; activityCount: number; href: string; avatarUrl?: string | null }
export type MemberAgent = { id: string; name: string; platform: AgentPlatform; model: string; role: string; url: string; visibility: LinkVisibility | null; connected: AgentConnection | null }

export const STACK_LIMIT = 20

/** Quick picks for the pickers (free text is always allowed too). */
export const AI_SUGGESTIONS = ['Claude', 'ChatGPT', 'Gemini', 'Grok', 'Cursor', 'Perplexity', 'GitHub Copilot', 'Claude Code', 'Codex', 'Midjourney', 'NotebookLM', 'v0']
export const SUB_SUGGESTIONS = ['ChatGPT Plus', 'ChatGPT Pro', 'Claude Pro', 'Claude Max', 'Cursor Pro', 'Cursor Ultra', 'Google AI Pro', 'Google AI Ultra', 'SuperGrok', 'SuperGrok Heavy', 'Perplexity Pro', 'Perplexity Max', 'GitHub Copilot Pro', 'Midjourney', 'ZCRE (지크)']
/** catalog types that count as 스킬·플러그인·MCP (from '사용 중' tool usage) */
export const SKILL_TYPES: ReadonlyArray<string> = ['agent_skill', 'mcp_server', 'cli_tool', 'cursor_rules', 'prompt']

export const STACK_GROUP_LABEL: Record<StackGroup, string> = {
  ai: msg('활용하는 AI'),
  subs: msg('구독 중인 서비스'),
  skills: msg('스킬·플러그인·MCP'),
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-·.]+/g, '')

/** Clean + de-duplicate one group's items (case/space-insensitive), cap at the limit; keeps a valid per-chip lock. */
export function cleanStackItems(
  items: Array<{ label: string; entryId?: string | null; visibility?: unknown }>,
  limit = STACK_LIMIT,
): Array<{ label: string; entryId: string | null; visibility: LinkVisibility | null }> {
  const seen = new Set<string>()
  const out: Array<{ label: string; entryId: string | null; visibility: LinkVisibility | null }> = []
  for (const it of items) {
    const label = (it.label || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!label) continue
    const key = it.entryId ? `id:${it.entryId}` : `t:${norm(label)}`
    if (seen.has(key) || seen.has(`t:${norm(label)}`)) continue
    seen.add(key)
    seen.add(`t:${norm(label)}`)
    const v = it.visibility
    out.push({ label, entryId: it.entryId || null, visibility: v === 'members' || v === 'friends' || v === 'private' ? v : null })
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
      },
    }))
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
