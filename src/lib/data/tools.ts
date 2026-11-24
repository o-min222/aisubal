import { cache } from 'react'
import type { Member, ToolboxEntry } from '@/lib/supabase/types'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { usageStacks, type ToolUsageStack } from '@/lib/tool-usage-rules'
export type { ToolUsageStack, ToolStackUser } from '@/lib/tool-usage-rules'
import { MOCK_PRODUCTS, MUTABLE_UPVOTES } from '@/lib/mock-products'
import { MUTABLE_TOOLBOX } from '@/lib/mock-toolbox'
import {
  coUsage,
  filterTools,
  kindOfType,
  sortTools,
  DEFAULT_TOOL_SORT,
  type ToolCategory,
  type ToolListItem,
  type ToolSort,
} from '@/lib/tool-rules'
import { mockHandle, mockPerson } from '@/lib/mock-social'
import { rankToolsForMember } from '@/lib/recommend-rules'
import { sortByRelation, type Relation } from '@/lib/social-rules'
import type { LinkVisibility } from '@/lib/profile-rules'
import { sortUsage } from '@/lib/profile-stack'
import { sb, isMock } from './client'
import { getRelations, socialAuthorIds } from './social'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'

/**
 * 갤러리 data: toolbox entries (MCP · 스킬 · CLI · 서비스, members' own services included)
 * plus '사용 중' (tool_users). Reads go through member RLS.
 */

/** A member who uses a tool, with the viewer's relation (friends → following → others). */
export type ToolUser = { id: string; name: string; handle: string | null; avatarUrl: string | null; relation: Relation }
export type ToolUsers = { count: number; users: ToolUser[]; usedByMe: boolean }

// ------------------------------------------------------------------ mock (DEV)
type MockState = { usage: Array<{ entry_id: string; member_id: string; created_at: string; position?: number | null }> }
const g = globalThis as unknown as { __aisubalToolUsage?: MockState; __aisubalUsageVis?: LinkVisibility; __aisubalToolLikes?: Array<{ entry_id: string; member_id: string }> }
function mockLikes() {
  return (g.__aisubalToolLikes ??= MUTABLE_TOOLBOX.slice(0, 4).flatMap((e, i) => ['member-2', 'member-3', 'member-4'].slice(0, 3 - (i % 3)).map((m) => ({ entry_id: e.id, member_id: m }))))
}
const DEV_VIEWER = 'dev-user-id' // DEV_BYPASS member in lib/auth

function mockUsage(): MockState {
  if (g.__aisubalToolUsage) return g.__aisubalToolUsage
  const ids = MUTABLE_TOOLBOX.map((e) => e.id)
  const seed: Array<[number, string[]]> = [
    [0, [DEV_VIEWER, 'member-2', 'member-3', 'member-4']],
    [1, [DEV_VIEWER, 'member-2']],
    [2, ['member-3', 'member-4']],
    [3, [DEV_VIEWER, 'member-4', 'member-2']],
    [5, ['member-2', 'member-3']],
  ]
  const usage: MockState['usage'] = []
  seed.forEach(([i, members], k) => {
    if (!ids[i]) return
    members.forEach((m, j) => usage.push({ entry_id: ids[i], member_id: m, created_at: new Date(Date.now() - (k * 10 + j) * 3600_000).toISOString() }))
  })
  g.__aisubalToolUsage = { usage }
  return g.__aisubalToolUsage
}

function mockEntries(): ToolboxEntry[] {
  const usage = mockUsage().usage
  const tools = MUTABLE_TOOLBOX.map((e, i) => ({
    ...e,
    user_count: usage.filter((u) => u.entry_id === e.id).length,
    like_count: mockLikes().filter((l) => l.entry_id === e.id).length,
    upvote_count: 0,
    ai_rating_avg: [4.6, 4.2, 0, 3.8, 4.9, 0, 4.1][i % 7],
    ai_rating_count: [5, 3, 0, 2, 4, 0, 1][i % 7],
    product_id: null,
    launched_at: null,
    kind: kindOfType(e.type),
    maker_ids: e.maker_ids ?? [],
    is_own: (e.maker_ids ?? []).length > 0,
  }))
  const launches: ToolboxEntry[] = MOCK_PRODUCTS.map((p) => ({
    id: `tool-${p.id}`,
    name: p.name,
    slug: `launch-${p.id}`,
    one_liner: p.tagline,
    description: p.description,
    type: 'product',
    tags: p.tags,
    icon_url: p.logo_url,
    canonical_url: p.website_url || `https://aisubal.vercel.app/launch/${p.id}`,
    github_url: p.github_url,
    homepage_url: p.website_url,
    license: null,
    last_commit_at: null,
    source_repo: null,
    install_snippets: { generic: `Visit ${p.website_url || p.github_url || ''}` },
    mention_count: 0,
    install_count: 0,
    avg_rating: 0,
    rating_count: 0,
    created_by_id: p.maker_ids[0] ?? null,
    featured: p.featured,
    created_at: p.created_at,
    updated_at: p.updated_at,
    product_id: p.id,
    launched_at: p.launched_at,
    user_count: usage.filter((u) => u.entry_id === `tool-${p.id}`).length,
    like_count: mockLikes().filter((l) => l.entry_id === `tool-${p.id}`).length,
    upvote_count: MUTABLE_UPVOTES.filter((u) => u.product_id === p.id).length,
    ai_rating_avg: 0,
    ai_rating_count: 0,
    kind: 'service',
    maker_ids: p.maker_ids,
    is_own: p.maker_ids.length > 0,
  }))
  return [...tools, ...launches]
}


/** Test hook */
export function __resetToolUsageMock() {
  g.__aisubalToolUsage = undefined
}

// ------------------------------------------------------------------ reads
/** A67: per request; the gallery lists tools twice (page + tag chips) from the same rows. */
const allEntries = cache(async (): Promise<ToolboxEntry[]> => {
  if (isMock()) return mockEntries()
  const supabase = await sb()
  const { data, error } = await supabase.from('toolbox_entries').select('*').limit(1000)
  if (error) throw error
  return (data || []) as ToolboxEntry[]
})

export const myToolIds = cache(async (memberId: string): Promise<Set<string>> => {
  if (isMock()) return new Set(mockUsage().usage.filter((u) => u.member_id === memberId).map((u) => u.entry_id))
  const supabase = await sb()
  const { data, error } = await supabase.from('tool_users').select('entry_id').eq('member_id', memberId).limit(1000)
  if (error) throw error
  return new Set(((data || []) as Array<{ entry_id: string }>).map((r) => r.entry_id))
})

/** 0100: entries I liked (one-tap 좋아요). */
export const myLikedToolIds = cache(async (memberId: string): Promise<Set<string>> => {
  if (isMock()) return new Set(mockLikes().filter((l) => l.member_id === memberId).map((l) => l.entry_id))
  const supabase = await sb()
  const { data, error } = await supabase.from('toolbox_likes').select('entry_id').eq('member_id', memberId).limit(1000)
  if (error) throw error
  return new Set(((data || []) as Array<{ entry_id: string }>).map((r) => r.entry_id))
})

export async function setToolLike(entryId: string, memberId: string, like: boolean): Promise<number> {
  if (isMock()) {
    const all = mockLikes().filter((l) => !(l.entry_id === entryId && l.member_id === memberId))
    if (like) all.push({ entry_id: entryId, member_id: memberId })
    g.__aisubalToolLikes = all
    return all.filter((l) => l.entry_id === entryId).length
  }
  const supabase = await sb()
  if (like) {
    const { error } = await supabase.from('toolbox_likes').upsert({ entry_id: entryId, member_id: memberId }, { onConflict: 'entry_id,member_id', ignoreDuplicates: true })
    if (error) throw error
  } else {
    const { error } = await supabase.from('toolbox_likes').delete().eq('entry_id', entryId).eq('member_id', memberId)
    if (error) throw error
  }
  const { data } = await supabase.from('toolbox_entries').select('like_count').eq('id', entryId).maybeSingle()
  return (data as { like_count: number } | null)?.like_count ?? 0
}

export async function listTools(
  viewerId: string,
  opts: { category?: ToolCategory | null; tag?: string | null; q?: string | null; sort?: ToolSort; mine?: boolean; rec?: boolean } = {},
): Promise<ToolListItem[]> {
  const [entries, mine, liked] = await Promise.all([allEntries(), myToolIds(viewerId), myLikedToolIds(viewerId).catch(() => new Set<string>())])
  const filtered = filterTools(entries, { ...opts, onlyIds: opts.mine ? mine : null })
  if (opts.rec) {
    // 추천: what people who use what I use also use, then tags of my tools, then popularity.
    // Things I already use are left out. Same scoring as the right rail (recommend-rules).
    const pairs = await usagePairsAround(viewerId).catch(() => [])
    const myTags = [...new Set(entries.filter((e) => mine.has(e.id)).flatMap((e) => e.tags.map((t) => t.toLowerCase())))]
    return rankToolsForMember(filtered, myTags, mine, filtered.length, coUsage(pairs, viewerId)).map((e) => ({ ...e, used_by_me: false, liked_by_me: liked.has(e.id) }))
  }
  return sortTools(filtered, opts.sort ?? DEFAULT_TOOL_SORT).map((e) => ({ ...e, used_by_me: mine.has(e.id), liked_by_me: liked.has(e.id) }))
}

/** Tools a member marked '사용 중' (profile: 내가 쓰는 것). */
export async function listMemberTools(memberId: string): Promise<ToolboxEntry[]> {
  if (isMock()) {
    const order = sortUsage(mockUsage().usage.filter((u) => u.member_id === memberId)).map((u) => u.entry_id)
    const all = mockEntries()
    return order.map((id) => all.find((e) => e.id === id)).filter((e): e is ToolboxEntry => Boolean(e))
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('tool_users')
    .select('created_at, entry:toolbox_entries(*)')
    .eq('member_id', memberId)
    // A90 (0126): owner's order; not-yet-placed (NULL) first, newest first
    .order('position', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })
    .limit(60)
  if (error) throw error
  return ((data || []) as unknown as Array<{ entry: ToolboxEntry | null }>).map((r) => r.entry).filter((e): e is ToolboxEntry => Boolean(e))
}

/** A90: the owner reorders their '내가 쓰는 것' (ids = entry ids in the new order). */
export async function reorderMemberTools(memberId: string, entryIds: string[]): Promise<void> {
  const ids = [...new Set(entryIds.filter((id) => typeof id === 'string' && id.length > 0))].slice(0, 200)
  if (isMock()) {
    for (const u of mockUsage().usage) if (u.member_id === memberId) { const k = ids.indexOf(u.entry_id); if (k >= 0) u.position = k }
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('member_tools_reorder', { p_entry_ids: ids })
  if (error) throw new Error(error.message)
}

/**
 * Who uses a tool, as a people list sorted friends → people I follow → others
 * (me last). Real-name profiles only.
 */
export async function getToolUsers(entryId: string, viewerId: string, limit = 100): Promise<ToolUsers> {
  let count = 0
  let base: Array<{ id: string; name: string; handle: string | null; avatarUrl: string | null }> = []
  let usedByMe = false
  if (isMock()) {
    const rows = mockUsage().usage.filter((u) => u.entry_id === entryId)
    count = rows.length
    usedByMe = rows.some((r) => r.member_id === viewerId)
    base = rows.slice(0, limit).map((r) => ({
      id: r.member_id,
      name: MOCK_MEMBERS.find((m) => m.id === r.member_id)?.display_name ?? mockPerson(r.member_id).name,
      handle: MOCK_MEMBERS.find((m) => m.id === r.member_id)?.handle ?? mockHandle(r.member_id),
      avatarUrl: null,
    }))
  } else {
    const supabase = await sb()
    const [{ data: counter }, { data }, { data: mine }] = await Promise.all([
      // the counter counts everyone; the rows below are only the marks visible to me (0077)
      supabase.from('toolbox_entries').select('user_count').eq('id', entryId).maybeSingle(),
      supabase
        .from('tool_users')
        .select(`created_at, member:members(${MEMBER_PUBLIC_COLUMNS})`)
        .eq('entry_id', entryId)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase.from('tool_users').select('entry_id').eq('entry_id', entryId).eq('member_id', viewerId).maybeSingle(),
    ])
    base = ((data || []) as unknown as Array<{ member: Member | null }>)
      .map((r) => r.member)
      .filter((m): m is Member => Boolean(m))
      .map((m) => ({ id: m.id, name: m.display_name, handle: m.handle ?? null, avatarUrl: m.avatar_url }))
    count = Math.max((counter as { user_count: number } | null)?.user_count ?? 0, base.length)
    usedByMe = Boolean(mine)
  }
  const rel = await getRelations(viewerId, base.map((u) => u.id)).catch(() => new Map<string, Relation>())
  const users = sortByRelation(
    base.map((u) => ({ ...u, relation: rel.get(u.id) ?? { isMe: u.id === viewerId, iFollow: false, followsMe: false, friend: 'none' as const } })),
    (u) => u.relation
  )
  return { count, users, usedByMe }
}

/** Per tool: friends first, then people I follow, who marked it '나도 써요'. */
/** Friends and people I follow, for socialToolUsers; a page can start this before it knows which tools it shows (A67). */
export function socialCircle(viewerId: string): Promise<[string[], string[]]> {
  return Promise.all([
    socialAuthorIds(viewerId, 'friends').catch(() => [] as string[]),
    socialAuthorIds(viewerId, 'following').catch(() => [] as string[]),
  ])
}

export async function socialToolUsers(viewerId: string, entryIds: string[], circle?: Promise<[string[], string[]]>): Promise<Map<string, ToolUsageStack>> {
  const out = new Map<string, ToolUsageStack>()
  if (!entryIds.length) return out
  const [friends, following] = await (circle ?? socialCircle(viewerId))
  // Visible marks only: RLS (0077) hides members whose '나도 써요' is friends-only or private.
  let rows: Array<{ entry_id: string; member_id: string; name: string; avatarUrl: string | null }> = []
  if (isMock()) {
    const want = new Set(entryIds)
    rows = mockUsage()
      .usage.filter((u) => want.has(u.entry_id))
      .map((u) => ({ entry_id: u.entry_id, member_id: u.member_id, name: MOCK_MEMBERS.find((m) => m.id === u.member_id)?.display_name ?? mockPerson(u.member_id).name, avatarUrl: null }))
  } else {
    const supabase = await sb()
    const { data } = await supabase
      .from('tool_users')
      .select('entry_id, member_id, member:members(display_name, avatar_url)')
      .in('entry_id', entryIds.slice(0, 300))
      .order('created_at', { ascending: false })
      .limit(3000)
    rows = ((data || []) as unknown as Array<{ entry_id: string; member_id: string; member: { display_name: string; avatar_url: string | null } | null }>).map((r) => ({
      entry_id: r.entry_id,
      member_id: r.member_id,
      name: r.member?.display_name ?? '멤버',
      avatarUrl: r.member?.avatar_url ?? null,
    }))
  }
  return usageStacks(rows, viewerId, new Set(friends), new Set(following))
}

export async function setToolUsage(entryId: string, memberId: string, using: boolean): Promise<number> {
  if (isMock()) {
    const s = mockUsage()
    s.usage = s.usage.filter((u) => !(u.entry_id === entryId && u.member_id === memberId))
    if (using) s.usage.unshift({ entry_id: entryId, member_id: memberId, created_at: new Date().toISOString() })
    return s.usage.filter((u) => u.entry_id === entryId).length
  }
  const supabase = await sb()
  if (using) {
    const { error } = await supabase.from('tool_users').upsert({ entry_id: entryId, member_id: memberId }, { onConflict: 'entry_id,member_id', ignoreDuplicates: true })
    if (error) throw error
  } else {
    const { error } = await supabase.from('tool_users').delete().eq('entry_id', entryId).eq('member_id', memberId)
    if (error) throw error
  }
  const { data } = await supabase.from('toolbox_entries').select('user_count').eq('id', entryId).maybeSingle()
  return (data as { user_count: number } | null)?.user_count ?? 0
}

/** Who sees my '나도 써요' marks (gallery stacks, who-uses lists, my profile). Counts stay anonymous totals. */
export async function getUsageVisibility(): Promise<LinkVisibility> {
  if (isMock()) return g.__aisubalUsageVis ?? 'members'
  const supabase = await sb()
  const { data, error } = await supabase.rpc('tool_usage_visibility')
  if (error) throw error
  return (data as LinkVisibility) ?? 'members'
}

export async function setUsageVisibility(vis: LinkVisibility): Promise<LinkVisibility> {
  if (isMock()) return (g.__aisubalUsageVis = vis)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('tool_usage_set_visibility', { p_vis: vis })
  if (error) throw error
  return data as LinkVisibility
}

/** (member, tool) pairs among people who share a tool with the viewer — for co-usage recommendations. */
export async function usagePairsAround(memberId: string): Promise<Array<{ member_id: string; entry_id: string }>> {
  if (isMock()) return mockUsage().usage.map(({ member_id, entry_id }) => ({ member_id, entry_id }))
  const mine = [...(await myToolIds(memberId))]
  if (!mine.length) return []
  const supabase = await sb()
  const { data: peers } = await supabase.from('tool_users').select('member_id').in('entry_id', mine.slice(0, 100)).limit(500)
  const peerIds = [...new Set(((peers || []) as Array<{ member_id: string }>).map((p) => p.member_id))].filter((id) => id !== memberId)
  if (!peerIds.length) return mine.map((entry_id) => ({ member_id: memberId, entry_id }))
  const { data } = await supabase.from('tool_users').select('member_id, entry_id').in('member_id', peerIds.slice(0, 200)).limit(2000)
  return [...mine.map((entry_id) => ({ member_id: memberId, entry_id })), ...((data || []) as Array<{ member_id: string; entry_id: string }>)]
}

/** Old /products/[id] links → the tool page of that launch. */
export async function toolSlugForProduct(productId: string): Promise<string | null> {
  if (isMock()) return mockEntries().find((e) => e.product_id === productId)?.slug ?? null
  const supabase = await sb()
  const { data } = await supabase.from('toolbox_entries').select('slug').eq('product_id', productId).maybeSingle()
  return (data as { slug: string } | null)?.slug ?? null
}

/** Mock-aware single entry lookup for launches that exist only in the DEV product store. */
export async function getMockLaunchEntry(slug: string): Promise<ToolboxEntry | null> {
  if (!isMock()) return null
  return mockEntries().find((e) => e.slug === slug || e.id === slug) ?? null
}
