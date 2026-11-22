/**
 * Profile "stack" shown on the unified profile card: 활용하는 AI, 구독 중인 서비스,
 * 스킬·플러그인·MCP, and 내 에이전트. Pure (no IO) so it is unit-tested.
 */
import type { LinkVisibility } from '@/lib/profile-rules'
import type { ToolboxType } from '@/lib/supabase/types'
import { msg } from '@/i18n/translate'

export type StackGroup = 'ai' | 'subs' | 'skills'
export type StackEntryRef = { id: string; slug: string; name: string; iconUrl: string | null; type?: ToolboxType | string }
export type StackItem = { label: string; entry: StackEntryRef | null }
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

export type MemberAgentInput = { name: string; platform: AgentPlatform; model: string; role: string; url: string; visibility: LinkVisibility }
/** Connected (token) activity merged in for display; hour-rounded for others. */
export type AgentConnection = { tokenId: string; lastActiveAt: string | null; activityCount: number; href: string }
export type MemberAgent = Omit<MemberAgentInput, 'visibility'> & { id: string; visibility: LinkVisibility | null; connected: AgentConnection | null }

export const STACK_LIMIT = 20
export const AGENT_LIMIT = 12

/** Quick picks for the pickers (free text is always allowed too). */
export const AI_SUGGESTIONS = ['Claude', 'ChatGPT', 'Gemini', 'Grok', 'Cursor', 'Perplexity', 'GitHub Copilot', 'Claude Code', 'Codex', 'Midjourney', 'NotebookLM', 'v0']
export const SUB_SUGGESTIONS = ['ChatGPT Plus', 'ChatGPT Pro', 'Claude Pro', 'Claude Max', 'Cursor Pro', 'Gemini Advanced', 'SuperGrok', 'Perplexity Pro', 'GitHub Copilot Pro', 'Midjourney']
/** catalog types that count as 스킬·플러그인·MCP (from '사용 중' tool usage) */
export const SKILL_TYPES: ReadonlyArray<string> = ['agent_skill', 'mcp_server', 'cli_tool', 'cursor_rules', 'prompt']

export const STACK_GROUP_LABEL: Record<StackGroup, string> = {
  ai: msg('활용하는 AI'),
  subs: msg('구독 중인 서비스'),
  skills: msg('스킬·플러그인·MCP'),
}

const norm = (s: string) => s.toLowerCase().replace(/[\s_\-·.]+/g, '')

/** Clean + de-duplicate one group's items (case/space-insensitive), cap at the limit. */
export function cleanStackItems(items: Array<{ label: string; entryId?: string | null }>, limit = STACK_LIMIT): Array<{ label: string; entryId: string | null }> {
  const seen = new Set<string>()
  const out: Array<{ label: string; entryId: string | null }> = []
  for (const it of items) {
    const label = (it.label || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    if (!label) continue
    const key = it.entryId ? `id:${it.entryId}` : `t:${norm(label)}`
    if (seen.has(key) || seen.has(`t:${norm(label)}`)) continue
    seen.add(key)
    seen.add(`t:${norm(label)}`)
    out.push({ label, entryId: it.entryId || null })
    if (out.length >= limit) break
  }
  return out
}

export type AgentValidation = { ok: true; agents: MemberAgentInput[] } | { ok: false; error: string }
export function validateAgents(raw: unknown): AgentValidation {
  if (!Array.isArray(raw)) return { ok: false, error: '형식이 올바르지 않아요.' }
  if (raw.length > AGENT_LIMIT) return { ok: false, error: `에이전트는 ${AGENT_LIMIT}개까지 등록할 수 있어요.` }
  const agents: MemberAgentInput[] = []
  for (const r of raw as Array<Record<string, unknown>>) {
    const name = String(r?.name ?? '').trim().slice(0, 40)
    if (!name) return { ok: false, error: '에이전트 이름을 입력해 주세요.' }
    const platform = (AGENT_PLATFORM_IDS as string[]).includes(String(r?.platform)) ? (r.platform as AgentPlatform) : 'other'
    const url = String(r?.url ?? '').trim()
    if (url && (!/^https:\/\/[^\s]+$/.test(url) || url.length > 300)) return { ok: false, error: `'${name}' 링크는 https:// 주소여야 해요.` }
    const vis = String(r?.visibility)
    agents.push({
      name,
      platform,
      model: String(r?.model ?? '').trim().slice(0, 60),
      role: String(r?.role ?? '').trim().slice(0, 80),
      url,
      visibility: vis === 'friends' || vis === 'private' ? vis : 'members',
    })
  }
  return { ok: true, agents }
}

/** Token-connected agents (profile_agents) a manual entry corresponds to, by name. */
export function matchConnected<T extends { agentName: string }>(name: string, connected: T[]): T | null {
  const n = norm(name)
  return connected.find((c) => norm(c.agentName) === n) ?? null
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
