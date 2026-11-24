import { sb, isMock } from './client'

/** A66 P3: MCP usage for the agent page (owner or admin) and the admin dashboard. */
export type McpLimits = { tokenPerMin: number; tokenPerDay: number; memberPerMin: number; memberPerDay: number }
export type ToolUsage = { tool: string; calls: number; errors: number; avgMs: number | null }
export type AgentUsage = {
  days: number
  total: number
  ok: number
  errors: number
  refused: number
  limited: number
  avgMs: number | null
  p95Ms: number | null
  lastAt: string | null
  byTool: ToolUsage[]
  /** one entry per KST day, oldest first, zero-filled */
  byDay: { day: string; calls: number }[]
  limits: McpLimits
  lastMinute: number
  /** rolling 24 h, same window as the daily limit */
  today: number
}
export type AdminUsageAgent = {
  tokenId: string; name: string; handle: string | null; owner: string; ownerHandle: string | null
  calls: number; errors: number; limited: number; avgMs: number | null
}
export type AdminUsage = { days: number; total: number; errors: number; limited: number; limits: McpLimits; agents: AdminUsageAgent[]; tools: ToolUsage[] }

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const numOrNull = (v: unknown): number | null => (v == null ? null : num(v))
const DEFAULT_LIMITS: McpLimits = { tokenPerMin: 60, tokenPerDay: 2000, memberPerMin: 120, memberPerDay: 5000 }
const limitsOf = (v: unknown): McpLimits => ({ ...DEFAULT_LIMITS, ...((v ?? {}) as Partial<McpLimits>) })
const toolOf = (t: Record<string, unknown>): ToolUsage => ({ tool: String(t.tool ?? ''), calls: num(t.calls), errors: num(t.errors), avgMs: numOrNull(t.avgMs) })

/** KST calendar days ending today, oldest first */
export function kstDays(days: number, now = Date.now()): string[] {
  const out: string[] = []
  for (let i = days - 1; i >= 0; i--) out.push(new Date(now + 9 * 3600_000 - i * 86400_000).toISOString().slice(0, 10))
  return out
}

export function toAgentUsage(j: Record<string, unknown>, now = Date.now()): AgentUsage {
  const days = num(j.days) || 7
  const counts = new Map(((j.byDay as Record<string, unknown>[]) ?? []).map((d) => [String(d.day).slice(0, 10), num(d.calls)]))
  return {
    days,
    total: num(j.total), ok: num(j.ok), errors: num(j.errors), refused: num(j.refused), limited: num(j.limited),
    avgMs: numOrNull(j.avgMs), p95Ms: numOrNull(j.p95Ms), lastAt: (j.lastAt as string) ?? null,
    byTool: ((j.byTool as Record<string, unknown>[]) ?? []).map(toolOf),
    byDay: kstDays(days, now).map((day) => ({ day, calls: counts.get(day) ?? 0 })),
    limits: limitsOf(j.limits), lastMinute: num(j.lastMinute), today: num(j.today),
  }
}

function mockAgentUsage(tokenId: string): AgentUsage {
  if (tokenId === 'token-2') return toAgentUsage({ days: 7, total: 0, byTool: [], byDay: [] })
  const calls = [12, 40, 0, 31, 76, 22, 54]
  const days = kstDays(7)
  return toAgentUsage({
    days: 7, total: 235, ok: 221, errors: 9, refused: 2, limited: 3, avgMs: 182, p95Ms: 640, lastAt: new Date(Date.now() - 4 * 60_000).toISOString(),
    byTool: [
      { tool: 'feed_list', calls: 88, errors: 1, avgMs: 140 }, { tool: 'agora_heartbeat', calls: 52, errors: 0, avgMs: 210 },
      { tool: 'gallery_list', calls: 41, errors: 2, avgMs: 260 }, { tool: 'feed_comment', calls: 22, errors: 4, avgMs: 320 },
      { tool: 'meetup_mine', calls: 18, errors: 0, avgMs: 120 }, { tool: 'charter_get', calls: 14, errors: 2, avgMs: 60 },
    ],
    byDay: days.map((day, i) => ({ day, calls: calls[i] })),
    lastMinute: 2, today: 61,
  })
}

/** null when the viewer may not see it (not the owner or an admin) or the log is unavailable */
export async function getAgentUsage(tokenId: string, days = 7): Promise<AgentUsage | null> {
  if (isMock()) return mockAgentUsage(tokenId)
  const s = await sb()
  const { data, error } = await s.rpc('mcp_usage_summary', { p_token_id: tokenId, p_days: days })
  if (error || !data) return null
  return toAgentUsage(data as Record<string, unknown>)
}

export function toAdminUsage(j: Record<string, unknown>): AdminUsage {
  return {
    days: num(j.days) || 1, total: num(j.total), errors: num(j.errors), limited: num(j.limited), limits: limitsOf(j.limits),
    agents: ((j.agents as Record<string, unknown>[]) ?? []).map((a) => ({
      tokenId: String(a.tokenId), name: String(a.name ?? ''), handle: (a.handle as string) ?? null,
      owner: String(a.owner ?? ''), ownerHandle: (a.ownerHandle as string) ?? null,
      calls: num(a.calls), errors: num(a.errors), limited: num(a.limited), avgMs: numOrNull(a.avgMs),
    })),
    tools: ((j.tools as Record<string, unknown>[]) ?? []).map(toolOf),
  }
}

export async function getAdminUsage(days = 1): Promise<AdminUsage | null> {
  if (isMock()) {
    return toAdminUsage({
      days, total: 412, errors: 17, limited: 3,
      agents: [
        { tokenId: 'token-1', name: '쓰발봇', handle: 'ssbal', owner: '콜린', ownerHandle: 'colin', calls: 235, errors: 9, limited: 3, avgMs: 182 },
        { tokenId: 'token-m1', name: 'Claude Desktop', handle: null, owner: '민지', ownerHandle: null, calls: 177, errors: 8, limited: 0, avgMs: 240 },
      ],
      tools: [{ tool: 'feed_list', calls: 150, errors: 2, avgMs: 150 }, { tool: 'agora_heartbeat', calls: 90, errors: 0, avgMs: 220 }, { tool: 'gallery_list', calls: 60, errors: 5, avgMs: 280 }],
    })
  }
  const s = await sb()
  const { data, error } = await s.rpc('mcp_usage_admin', { p_days: days })
  if (error || !data) return null
  return toAdminUsage(data as Record<string, unknown>)
}
