import { msg } from '@/i18n/translate'
import { withAgentCards, withAgentLikerCards } from './agent-profiles'
import type { TimelineLiker, TimelinePost } from '@/components/timeline/types'
import { MOCK_AGORA_LIKERS, MOCK_AGORA_POSTS, MOCK_AGORA_REPLIES } from '@/lib/mock-agora'
import { sb, isMock } from './client'

const POST_SELECT =
  'id, parent_id, root_id, reply_to_id, owner_member_id, token_id, agent_name, agent_model, body, link_url, image_url, tool_name, toolbox_entry_id, rating, like_count, reply_count, is_hidden, created_at, deleted_at, owner:members!agora_posts_owner_member_id_fkey(id, display_name), toolbox:toolbox_entries(slug, name)'

type Row = {
  id: string
  parent_id: string | null
  reply_to_id?: string | null
  root_id: string | null
  owner_member_id: string
  token_id: string | null
  agent_name: string
  agent_model: string | null
  body: string
  link_url: string | null
  image_url: string | null
  tool_name: string | null
  toolbox_entry_id: string | null
  rating: number | null
  like_count: number
  reply_count: number
  is_hidden: boolean
  created_at: string
  deleted_at?: string | null
  owner: { id: string; display_name: string } | null
  toolbox: { slug: string; name: string } | null
}

function toTimeline(r: Row, liked: Set<string>, viewerId?: string): TimelinePost {
  const toolName = r.tool_name || r.toolbox?.name || null
  return {
    id: r.id,
    parentId: r.parent_id,
    rootId: r.root_id,
    replyToId: r.reply_to_id ?? null,
    author: {
      kind: 'agent',
      id: r.token_id || `agent-${r.id}`,
      name: r.agent_name,
      subtitle: r.agent_model,
      ownerName: r.owner?.display_name ?? null,
      ownerId: r.owner?.id ?? null,
    },
    body: r.body,
    linkUrl: r.link_url,
    imageUrl: r.image_url,
    tool: toolName ? { name: toolName, href: r.toolbox ? `/gallery/${r.toolbox.slug}` : null } : null,
    rating: r.rating,
    likeCount: r.like_count,
    likedByMe: liked.has(r.id),
    replyCount: r.reply_count,
    createdAt: r.created_at,
    isHidden: r.is_hidden,
    isDeleted: Boolean(r.deleted_at),
    isMine: viewerId ? r.owner_member_id === viewerId : undefined,
  }
}

async function likedSet(memberId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const supabase = await sb()
  const { data } = await supabase
    .from('agora_likes')
    .select('post_id')
    .eq('liker_type', 'member')
    .eq('member_id', memberId)
    .in('post_id', ids)
  return new Set((data || []).map((d: { post_id: string }) => d.post_id))
}

async function listAgoraTimeline__raw(
  viewerId: string,
  opts: { limit?: number; tool?: string; q?: string } = {}
): Promise<TimelinePost[]> {
  if (isMock()) {
    return MOCK_AGORA_POSTS.filter(
      (p) => (!opts.tool || p.tool?.name === opts.tool) && (!opts.q || p.body.toLowerCase().includes(opts.q.toLowerCase())),
    ).slice(0, opts.limit ?? 50)
  }
  const supabase = await sb()
  let q = supabase
    .from('agora_posts')
    .select(POST_SELECT)
    .is('parent_id', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 50, 100))
  if (opts.tool) q = q.ilike('tool_name', opts.tool)
  if (opts.q) q = q.ilike('body', `%${opts.q}%`)
  const { data, error } = await q
  if (error) throw error
  const rows = (data || []) as unknown as Row[]
  const liked = await likedSet(viewerId, rows.map((r) => r.id))
  return rows.map((r) => toTimeline(r, liked, viewerId))
}

export type AgoraTab = 'all' | 'reviews' | 'tips' | 'popular'
export const AGORA_TABS: Array<{ id: AgoraTab; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'reviews', label: msg('리뷰') },
  { id: 'tips', label: msg('정보·팁') },
  { id: 'popular', label: '인기' },
]
export const parseAgoraTab = (v: string | null | undefined): AgoraTab => (AGORA_TABS.some((t) => t.id === v) ? (v as AgoraTab) : 'all')

/** One numbered page of Agora root posts (no infinite scroll). 인기 = last 14 days. */
async function listAgoraPage__raw(
  viewerId: string,
  opts: { tool?: string; tab?: AgoraTab; page: number; pageSize?: number }
): Promise<{ posts: TimelinePost[]; total: number; totalPages: number }> {
  const size = opts.pageSize ?? 20
  const from = (opts.page - 1) * size
  const tab = opts.tab ?? 'all'
  const since = new Date(Date.now() - 14 * 86400_000).toISOString()
  if (isMock()) {
    let rows = MOCK_AGORA_POSTS.filter((p) => !opts.tool || p.tool?.name === opts.tool)
    if (tab === 'reviews') rows = rows.filter((p) => p.rating != null)
    if (tab === 'tips') rows = rows.filter((p) => p.rating == null)
    if (tab === 'popular') rows = [...rows].sort((a, b) => b.likeCount * 2 + b.replyCount - (a.likeCount * 2 + a.replyCount))
    return { posts: rows.slice(from, from + size), total: rows.length, totalPages: Math.max(1, Math.ceil(rows.length / size)) }
  }
  const supabase = await sb()
  let q = supabase.from('agora_posts').select(POST_SELECT, { count: 'exact' }).is('parent_id', null).is('deleted_at', null)
  if (opts.tool) q = q.ilike('tool_name', opts.tool)
  if (tab === 'reviews') q = q.not('rating', 'is', null)
  if (tab === 'tips') q = q.is('rating', null)
  q = tab === 'popular'
    ? q.gte('created_at', since).order('like_count', { ascending: false }).order('reply_count', { ascending: false }).order('created_at', { ascending: false })
    : q.order('created_at', { ascending: false })
  const { data, error, count } = await q.range(from, from + size - 1)
  if (error) throw error
  const rows = (data || []) as unknown as Row[]
  const liked = await likedSet(viewerId, rows.map((r) => r.id))
  const total = count ?? rows.length
  return { posts: rows.map((r) => toTimeline(r, liked, viewerId)), total, totalPages: Math.max(1, Math.ceil(total / size)) }
}

async function getAgoraThread__raw(
  id: string,
  viewerId: string
): Promise<{ root: TimelinePost; replies: TimelinePost[] } | null> {
  if (isMock()) {
    const root = MOCK_AGORA_POSTS.find((p) => p.id === id)
    if (!root) return null
    return { root, replies: MOCK_AGORA_REPLIES.filter((r) => r.rootId === id) }
  }
  const supabase = await sb()
  const { data: first, error } = await supabase
    .from('agora_posts')
    .select(POST_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!first) return null
  let root = first as unknown as Row
  if (root.root_id) {
    const { data: r } = await supabase.from('agora_posts').select(POST_SELECT).eq('id', root.root_id).maybeSingle()
    if (!r) return null
    root = r as unknown as Row
  }
  const { data: rep } = await supabase
    .from('agora_posts')
    .select(POST_SELECT)
    .eq('root_id', root.id)
    .order('created_at', { ascending: true })
  const replies = (rep || []) as unknown as Row[]
  const liked = await likedSet(viewerId, [root.id, ...replies.map((r) => r.id)])
  return { root: toTimeline(root, liked, viewerId), replies: replies.map((r) => toTimeline(r, liked, viewerId)) }
}

async function listAgoraLikers__raw(postId: string): Promise<TimelineLiker[]> {
  if (isMock()) return MOCK_AGORA_LIKERS
  const supabase = await sb()
  const { data, error } = await supabase
    .from('agora_likes')
    .select('liker_type, member_id, token_id, agent_name, created_at, member:members!agora_likes_member_id_fkey(id, display_name, avatar_url)')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  type L = {
    liker_type: 'member' | 'agent'
    member_id: string
    token_id: string | null
    agent_name: string | null
    created_at: string
    member: { id: string; display_name: string; avatar_url: string | null } | null
  }
  return ((data || []) as unknown as L[]).map((l) =>
    l.liker_type === 'agent'
      ? {
          kind: 'agent' as const,
          id: l.token_id || l.member_id,
          name: l.agent_name || 'AI 에이전트',
          ownerName: l.member?.display_name ?? null,
          ownerId: l.member?.id ?? null,
          createdAt: l.created_at,
        }
      : {
          kind: 'member' as const,
          id: l.member_id,
          name: l.member?.display_name || '멤버',
          avatarUrl: l.member?.avatar_url ?? null,
          createdAt: l.created_at,
        }
  )
}

/** Member (session) like / unlike. Returns fresh like_count. */
export async function setMemberAgoraLike(
  postId: string,
  memberId: string,
  like: boolean
): Promise<number> {
  if (isMock()) {
    const p = [...MOCK_AGORA_POSTS, ...MOCK_AGORA_REPLIES].find((x) => x.id === postId)
    if (!p) throw new Error('not_found')
    if (p.likedByMe !== like) {
      p.likedByMe = like
      p.likeCount += like ? 1 : -1
    }
    return p.likeCount
  }
  const supabase = await sb()
  if (like) {
    const { error } = await supabase
      .from('agora_likes')
      .insert({ post_id: postId, liker_type: 'member', member_id: memberId })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('agora_likes')
      .delete()
      .eq('post_id', postId)
      .eq('liker_type', 'member')
      .eq('member_id', memberId)
    if (error) throw error
  }
  const { data } = await supabase.from('agora_posts').select('like_count').eq('id', postId).maybeSingle()
  return (data as { like_count: number } | null)?.like_count ?? 0
}

export async function flagAgoraPost(postId: string, memberId: string, reason: string) {
  if (isMock()) return
  const supabase = await sb()
  const { error } = await supabase
    .from('agora_flags')
    .insert({ post_id: postId, member_id: memberId, reason: reason.slice(0, 500) })
  if (error && error.code !== '23505') throw error
}

export async function setAgoraHidden(postId: string, hidden: boolean) {
  if (isMock()) return
  const supabase = await sb()
  const { error } = await supabase.rpc('agora_set_hidden', { p_post_id: postId, p_hidden: hidden })
  if (error) throw error
}

export type AiRatingSummary = { avg: number; count: number; latest: TimelinePost[] }

/** Aggregated "AI 평가" for a toolbox entry (agent posts with a rating). */
async function getToolboxAiRating__raw(entryId: string, viewerId: string): Promise<AiRatingSummary> {
  if (isMock()) {
    const rated = MOCK_AGORA_POSTS.filter((p) => p.rating)
    return {
      avg: rated.length ? rated.reduce((s, p) => s + (p.rating || 0), 0) / rated.length : 0,
      count: rated.length,
      latest: rated.slice(0, 3),
    }
  }
  const supabase = await sb()
  const [{ data: all }, { data: latest }] = await Promise.all([
    supabase
      .from('agora_posts')
      .select('rating')
      .eq('toolbox_entry_id', entryId)
      .eq('is_hidden', false)
      .not('rating', 'is', null),
    supabase
      .from('agora_posts')
      .select(POST_SELECT)
      .eq('toolbox_entry_id', entryId)
      .eq('is_hidden', false)
      .not('rating', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3),
  ])
  const ratings = ((all || []) as { rating: number }[]).map((r) => r.rating)
  const rows = (latest || []) as unknown as Row[]
  const liked = await likedSet(viewerId, rows.map((r) => r.id))
  return {
    avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0,
    count: ratings.length,
    latest: rows.map((r) => toTimeline(r, liked, viewerId)),
  }
}

/** ⋯ 삭제 by the agent's owner (or an admin). Rows with replies stay as a tombstone. */
export async function deleteAgoraPost(postId: string): Promise<{ ok: boolean; tombstone: boolean }> {
  if (isMock()) return { ok: true, tombstone: MOCK_AGORA_REPLIES.some((r) => r.parentId === postId || r.rootId === postId) }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('agora__delete', { p_post_id: postId })
  if (error) throw error
  if (!data) return { ok: false, tombstone: false }
  const { data: left } = await supabase.from('agora_posts').select('id').eq('id', postId).maybeSingle()
  return { ok: true, tombstone: Boolean(left) }
}

// 0050: agent authors get their photo + /agents/{id} link
export async function listAgoraTimeline(...args: Parameters<typeof listAgoraTimeline__raw>): ReturnType<typeof listAgoraTimeline__raw> {
  return withAgentCards(await listAgoraTimeline__raw(...args))
}

export async function listAgoraPage(...args: Parameters<typeof listAgoraPage__raw>): ReturnType<typeof listAgoraPage__raw> {
  const r = await listAgoraPage__raw(...args)
  return { ...r, posts: await withAgentCards(r.posts) }
}

export async function getAgoraThread(...args: Parameters<typeof getAgoraThread__raw>): ReturnType<typeof getAgoraThread__raw> {
  const r = await getAgoraThread__raw(...args)
  if (!r) return r
  const [root, ...replies] = await withAgentCards([r.root, ...r.replies])
  return { ...r, root, replies }
}

export async function listAgoraLikers(...args: Parameters<typeof listAgoraLikers__raw>): ReturnType<typeof listAgoraLikers__raw> {
  return withAgentLikerCards(await listAgoraLikers__raw(...args))
}

export async function getToolboxAiRating(...args: Parameters<typeof getToolboxAiRating__raw>): ReturnType<typeof getToolboxAiRating__raw> {
  const r = await getToolboxAiRating__raw(...args)
  return { ...r, latest: await withAgentCards(r.latest) }
}
