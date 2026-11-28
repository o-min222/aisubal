import { msg } from '@/i18n/translate'
import type { ToolboxEntry, ToolboxType } from '@/lib/supabase/types'

/**
 * 갤러리 rules: one list for MCP servers, skills, CLIs and services (members' own services
 * included). Category chips are tags over `type`; free tags filter on `tags`.
 * The type values are unchanged for backward compatibility: rules (cursor_rules) and prompts
 * are 스킬 with a small sub-label, and former 런치 (product) entries are 서비스.
 */
export const TOOL_CATEGORIES = [
  { id: 'mcp', label: 'MCP', types: ['mcp_server'] },
  { id: 'skill', label: msg('스킬'), types: ['agent_skill', 'cursor_rules', 'prompt'] },
  { id: 'cli', label: 'CLI', types: ['cli_tool'] },
  { id: 'service', label: msg('서비스'), types: ['saas_service', 'product'] },
] as const satisfies ReadonlyArray<{ id: string; label: string; types: readonly ToolboxType[] }>

export type ToolCategory = (typeof TOOL_CATEGORIES)[number]['id']
export type ToolSort = 'popular' | 'users' | 'newest' | 'ai'
type ToolKind = 'tool' | 'service'

/** A49: newest member uploads first by default; the others stay one tap away. */
export const DEFAULT_TOOL_SORT: ToolSort = 'newest'
export const TOOL_SORTS: { id: ToolSort; label: string }[] = [
  { id: 'newest', label: msg('최신') },
  { id: 'popular', label: msg('인기') },
  { id: 'users', label: msg('많이 쓰는') },
  { id: 'ai', label: msg('AI 평가') },
]

/** Category label for a type (the chip on rows and cards). */
export const TOOL_TYPE_CHIP: Record<ToolboxType, string> = {
  mcp_server: 'MCP',
  agent_skill: msg('스킬'),
  prompt: msg('스킬'),
  cursor_rules: msg('스킬'),
  cli_tool: 'CLI',
  saas_service: msg('서비스'),
  product: msg('서비스'),
}

/** Small sub-label next to the category chip for types folded into a category. */
export const TOOL_SUBLABEL: Partial<Record<ToolboxType, string>> = {
  cursor_rules: msg('룰'),
  prompt: msg('프롬프트'),
}

export function kindOfType(type: string): ToolKind {
  return type === 'saas_service' || type === 'product' ? 'service' : 'tool'
}

/** 제작자 badge: an approved "내가 만든 서비스예요" or a former launch with makers. */
export function isOwnEntry(e: Pick<ToolboxEntry, 'is_own' | 'maker_ids' | 'product_id'>): boolean {
  return Boolean(e.is_own ?? (e.maker_ids && e.maker_ids.length > 0))
}

function isToolCategory(v: unknown): v is ToolCategory {
  return typeof v === 'string' && TOOL_CATEGORIES.some((c) => c.id === v)
}

/** Accepts the old toolbox/product sort names too (trending, rated, …). */
export function parseToolSort(v: string | null | undefined): ToolSort {
  if (v === 'users' || v === 'popular' || v === 'ai') return v
  return DEFAULT_TOOL_SORT
}

/** Old category ids and ?type= values that now live in another category. */
const LEGACY_CATEGORY: Record<string, ToolCategory> = {
  launch: 'service',
  product: 'service',
  products: 'service',
  rules: 'skill',
  prompt: 'skill',
  prompts: 'skill',
}

/** Old ?type=mcp_server / ?category=launch|rules|prompt links map onto the 4 category chips. */
export function categoryFromLegacyType(type: string | null | undefined): ToolCategory | null {
  if (!type) return null
  if (isToolCategory(type)) return type
  if (LEGACY_CATEGORY[type]) return LEGACY_CATEGORY[type]
  const c = TOOL_CATEGORIES.find((x) => (x.types as readonly string[]).includes(type))
  return c ? c.id : null
}

export function typesForCategory(category: ToolCategory | null): readonly ToolboxType[] | null {
  if (!category) return null
  return TOOL_CATEGORIES.find((c) => c.id === category)?.types ?? null
}

export type ToolListItem = ToolboxEntry & { used_by_me: boolean; liked_by_me?: boolean }

export function popularityScore(e: ToolboxEntry): number {
  return (
    (e.user_count ?? 0) * 3 +
    e.mention_count * 2 +
    e.install_count +
    (e.upvote_count ?? 0) * 2 +
    // A84: the gallery's ▲ upvote is the 좋아요, so the popular ranks follow it
    (e.like_count ?? 0) * 2 +
    Number(e.avg_rating) * e.rating_count +
    (e.featured ? 5 : 0)
  )
}

export function sortTools<T extends ToolboxEntry>(list: T[], sort: ToolSort): T[] {
  const out = [...list]
  const time = (e: ToolboxEntry) => new Date(e.launched_at || e.created_at).getTime()
  // 최신 = when it was added to the gallery (a member's upload), not the upstream launch date
  if (sort === 'newest') return out.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  if (sort === 'users') return out.sort((a, b) => (b.user_count ?? 0) - (a.user_count ?? 0) || popularityScore(b) - popularityScore(a) || time(b) - time(a))
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
  return `/gallery/${e.slug}`
}
