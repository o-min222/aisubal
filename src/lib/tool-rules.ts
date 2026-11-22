import { msg } from '@/i18n/translate'
import type { ToolboxEntry, ToolboxType } from '@/lib/supabase/types'

/**
 * '툴' section rules: one list for skills/MCP/CLI/services and product launches.
 * Category chips are tags over `type`; free tags filter on `tags`.
 */
export const TOOL_CATEGORIES = [
  { id: 'mcp', label: 'MCP', types: ['mcp_server'] },
  { id: 'skill', label: msg('스킬'), types: ['agent_skill'] },
  { id: 'prompt', label: msg('프롬프트'), types: ['prompt'] },
  { id: 'rules', label: msg('룰'), types: ['cursor_rules'] },
  { id: 'cli', label: 'CLI', types: ['cli_tool'] },
  { id: 'service', label: msg('서비스/프로덕트'), types: ['saas_service', 'product'] },
  { id: 'launch', label: msg('런치'), types: ['product'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; types: readonly ToolboxType[] }>

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]['id']
export type ToolSort = 'popular' | 'newest' | 'ai'

export const TOOL_SORTS: { id: ToolSort; label: string }[] = [
  { id: 'popular', label: msg('인기') },
  { id: 'newest', label: msg('최신') },
  { id: 'ai', label: msg('AI 평가') },
]

export const TOOL_TYPE_CHIP: Record<ToolboxType, string> = {
  mcp_server: 'MCP',
  agent_skill: msg('스킬'),
  prompt: msg('프롬프트'),
  cursor_rules: msg('룰'),
  cli_tool: 'CLI',
  saas_service: msg('서비스'),
  product: msg('프로덕트'),
}

export function isToolCategory(v: unknown): v is ToolCategory {
  return typeof v === 'string' && TOOL_CATEGORIES.some((c) => c.id === v)
}

/** Accepts the old toolbox/product sort names too (trending, rated, …). */
export function parseToolSort(v: string | null | undefined): ToolSort {
  if (v === 'newest' || v === 'ai') return v
  return 'popular'
}

/** Old ?type=mcp_server links map onto the new category chips. */
export function categoryFromLegacyType(type: string | null | undefined): ToolCategory | null {
  if (!type) return null
  if (isToolCategory(type)) return type
  if (type === 'product') return 'launch'
  const c = TOOL_CATEGORIES.find((x) => x.id !== 'launch' && (x.types as readonly string[]).includes(type))
  return c ? c.id : null
}

export function typesForCategory(category: ToolCategory | null): readonly ToolboxType[] | null {
  if (!category) return null
  return TOOL_CATEGORIES.find((c) => c.id === category)?.types ?? null
}

export type ToolListItem = ToolboxEntry & { used_by_me: boolean }

export function popularityScore(e: ToolboxEntry): number {
  return (
    (e.user_count ?? 0) * 3 +
    e.mention_count * 2 +
    e.install_count +
    (e.upvote_count ?? 0) * 2 +
    Number(e.avg_rating) * e.rating_count +
    (e.featured ? 5 : 0)
  )
}

export function sortTools<T extends ToolboxEntry>(list: T[], sort: ToolSort): T[] {
  const out = [...list]
  const time = (e: ToolboxEntry) => new Date(e.launched_at || e.created_at).getTime()
  if (sort === 'newest') return out.sort((a, b) => time(b) - time(a))
  if (sort === 'ai') {
    return out.sort(
      (a, b) =>
        Number(b.ai_rating_avg ?? 0) - Number(a.ai_rating_avg ?? 0) ||
        (b.ai_rating_count ?? 0) - (a.ai_rating_count ?? 0) ||
        popularityScore(b) - popularityScore(a),
    )
  }
  return out.sort((a, b) => popularityScore(b) - popularityScore(a) || time(b) - time(a))
}

export function filterTools<T extends ToolboxEntry>(
  list: T[],
  opts: { category?: ToolCategory | null; tag?: string | null; q?: string | null; onlyIds?: Set<string> | null },
): T[] {
  const types = typesForCategory(opts.category ?? null)
  const tag = opts.tag?.toLowerCase() || null
  const q = opts.q?.trim().toLowerCase() || null
  return list.filter(
    (e) =>
      (!types || types.includes(e.type)) &&
      (!tag || e.tags.some((t) => t.toLowerCase() === tag)) &&
      (!q || `${e.name} ${e.one_liner} ${e.tags.join(' ')}`.toLowerCase().includes(q)) &&
      (!opts.onlyIds || opts.onlyIds.has(e.id)),
  )
}

/** Most common free tags across the list (for the tag chip row). */
export function topTags(list: ToolboxEntry[], limit = 12): string[] {
  const counts = new Map<string, number>()
  for (const e of list) for (const t of e.tags) counts.set(t.toLowerCase(), (counts.get(t.toLowerCase()) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([t]) => t)
}

/**
 * "People who use what you use also use…": co-usage counts per tool, from
 * (member, tool) pairs. Tools the viewer already uses are excluded.
 */
export function coUsage(pairs: Array<{ member_id: string; entry_id: string }>, viewerId: string): Map<string, number> {
  const mine = new Set(pairs.filter((p) => p.member_id === viewerId).map((p) => p.entry_id))
  const peers = new Set(pairs.filter((p) => p.member_id !== viewerId && mine.has(p.entry_id)).map((p) => p.member_id))
  const out = new Map<string, number>()
  for (const p of pairs) {
    if (!peers.has(p.member_id) || mine.has(p.entry_id)) continue
    out.set(p.entry_id, (out.get(p.entry_id) ?? 0) + 1)
  }
  return out
}

export function toolHref(e: Pick<ToolboxEntry, 'slug'>): string {
  return `/tools/${e.slug}`
}
