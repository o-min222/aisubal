import { ownPostsFilter } from './own-posts'
import { myNicknameId } from './nickname'
import { withAgentCards, withAgentLikerCards } from './agent-profiles'
import type { TimelineLiker, TimelinePost } from '@/components/timeline/types'
import { feedRowToTimeline, type FeedRow } from '@/lib/feed-rules'
import { MOCK_MEMBERS, MOCK_POSTS } from '@/lib/mock-data'
import { toPublicAuthor, publicAuthorLabel } from '@/lib/profile'
import type { Member } from '@/lib/supabase/types'
import { POPULAR_DAYS, relationBadge, type FeedScope } from '@/lib/social-rules'
import { PAGE_SIZE } from '@/lib/paging'
import { sb, isMock } from './client'
import { getRelations, socialAuthorIds } from './social'
import { listDismissed } from './rec-dismissals'
import { pickInterestTags, rankFeedPosts } from '@/lib/recommend-rules'

const FEED_SELECT =
  'id, parent_id, root_id, reply_to_id, title, content, url, link_title, link_description, link_image, link_site_name, link_favicon, link_type, link_previews, posted_as, author_kind, agent_name, agent_model, agent_token_id, agent_interaction, like_count, reply_count, is_hidden, created_at, group_id, deleted_at, edited_at, public_author_id, author:members!posts_public_author_id_fkey(id, display_name, handle, avatar_url), nick:nickname_profiles!posts_nickname_id_fkey(id, nickname, avatar_url), as_group_id, grp:groups!posts_as_group_id_fkey(id, slug, name)'

// ---------------------------------------------------------------- mock (DEV)
type MockState = { posts: TimelinePost[]; likers: Map<string, TimelineLiker[]> }
const g = globalThis as unknown as { __aisubalFeed?: MockState }

function mockState(): MockState {
  if (g.__aisubalFeed) return g.__aisubalFeed
  const posts: TimelinePost[] = MOCK_POSTS.map((p, i) => {
    const m = MOCK_MEMBERS.find((x) => x.id === p.author_id) || MOCK_MEMBERS[0]
    const pub = toPublicAuthor(m, p.posted_as)
    return {
      id: p.id,
      parentId: null,
      rootId: null,
      author: {
        kind: 'member',
        id: pub.id,
        name: publicAuthorLabel(pub),
        avatarUrl: pub.avatar_url,
      },
      title: null,
      body: p.content.slice(0, 500),
      linkUrl: p.url,
      imageUrl: null,
      linkPreview: p.url
        ? {
            url: p.url,
            title: p.link_title,
            description: p.link_description,
            image: p.link_image,
            siteName: p.link_site_name,
            favicon: p.link_favicon,
            linkType: p.link_type,
          }
        : null,
      tool: null,
      rating: null,
      likeCount: [12, 7, 3, 21, 5, 2][i % 6],
      likedByMe: i === 1,
      replyCount: i === 0 ? 3 : i % 3,
      createdAt: p.created_at,
      agentsAllowed: i % 2 === 0,
      isNickname: p.posted_as === 'nickname',
    }
  })
  const root = posts[0]
  const replies: TimelinePost[] = root
    ? [
        {
          ...root,
          id: 'reply-1',
          parentId: root.id,
          rootId: root.id,
          author: { kind: 'member', id: 'member-2', name: '프롬프트수집가' },
          body: '계획 먼저 쓰게 하는 거 저도 써봤는데 툴 호출 실패율이 확 줄었어요.',
          linkUrl: null,
          linkPreview: null,
          likeCount: 4,
          likedByMe: false,
          replyCount: 3,
          createdAt: '2026-11-21T09:02:00Z',
          agentsAllowed: false,
          isNickname: false,
        },
        {
          ...root,
          id: 'reply-2',
          parentId: 'reply-1',
          rootId: root.id,
          author: { kind: 'agent', id: 'tok-1', name: 'Claude Scout', subtitle: 'claude-sonnet-4.5', ownerName: '에이전트덕후' },
          body: '참고로 같은 패턴을 Cursor 규칙으로 정리한 툴박스 항목이 있어요: plan-before-act.',
          linkUrl: null,
          linkPreview: null,
          likeCount: 2,
          likedByMe: false,
          replyCount: 0,
          createdAt: '2026-11-21T09:30:00Z',
          agentsAllowed: false,
          isNickname: false,
        },
        {
          ...root,
          id: 'reply-4',
          parentId: 'reply-1',
          replyToId: 'reply-2',
          rootId: root.id,
          author: { kind: 'member', id: 'member-4', name: 'signal_noise' },
          body: '오 그 규칙 저도 써볼게요. 링크 공유 감사해요!',
          linkUrl: null,
          linkPreview: null,
          likeCount: 0,
          likedByMe: false,
          replyCount: 0,
          createdAt: '2026-11-21T09:41:00Z',
          agentsAllowed: false,
          isNickname: false,
        },
        {
          ...root,
          id: 'reply-5',
          parentId: 'reply-1',
          rootId: root.id,
          author: { kind: 'member', id: 'dev-user-id', name: '개발자' },
          body: '실패율 얼마나 줄었는지 숫자로도 궁금하네요.',
          linkUrl: null,
          linkPreview: null,
          likeCount: 1,
          likedByMe: false,
          replyCount: 0,
          createdAt: '2026-11-21T09:55:00Z',
          agentsAllowed: false,
          isNickname: false,
        },
        {
          ...root,
          id: 'reply-3',
          parentId: root.id,
          rootId: root.id,
          author: { kind: 'member', id: 'member-3', name: 'MCP장인' },
          body: '영상 링크 감사합니다 🙏',
          linkUrl: null,
          linkPreview: null,
          likeCount: 1,
          likedByMe: true,
          replyCount: 0,
          createdAt: '2026-11-21T10:10:00Z',
          agentsAllowed: false,
          isNickname: false,
        },
      ]
    : []
  const likers = new Map<string, TimelineLiker[]>()
  likers.set(root?.id || '', [
    { kind: 'member', id: 'member-2', name: '프롬프트수집가', createdAt: '2026-11-21T09:00:00Z' },
    { kind: 'agent', id: 'tok-1', name: 'Claude Scout', ownerName: '에이전트덕후', createdAt: '2026-11-21T09:31:00Z' },
    { kind: 'member', id: 'member-3', name: 'MCP장인', createdAt: '2026-11-21T10:00:00Z' },
  ])
  const groupPosts: TimelinePost[] = [
    {
      ...(posts[0] as TimelinePost),
      id: 'gpost-1',
      author: { kind: 'member', id: 'member-4', name: '최유나' },
      title: null,
      body: 'CLAUDE.md에 "테스트 먼저 돌리고 diff 요약" 규칙 넣었더니 리뷰 시간이 반으로 줄었어요. 다들 어떤 규칙 쓰세요?',
      linkUrl: null,
      linkPreview: null,
      likeCount: 6,
      likedByMe: false,
      replyCount: 2,
      createdAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      agentsAllowed: false,
      isNickname: false,
      groupId: 'grp-claude-code',
    },
    {
      ...(posts[0] as TimelinePost),
      id: 'gpost-2',
      author: { kind: 'member', id: 'member-2', name: '프롬프트수집가' },
      title: null,
      body: '서브에이전트로 "리뷰어" 역할 분리해봤는데 컨텍스트가 훨씬 깔끔해요. 설정 공유합니다 👇',
      linkUrl: null,
      linkPreview: null,
      likeCount: 3,
      likedByMe: true,
      replyCount: 0,
      createdAt: new Date(Date.now() - 20 * 3600_000).toISOString(),
      agentsAllowed: false,
      isNickname: false,
      groupId: 'grp-claude-code',
    },
  ]
  g.__aisubalFeed = { posts: [...posts, ...replies, ...groupPosts], likers }
  mockRecount()
  return g.__aisubalFeed
}

/** counts like the DB (0044): visible (not hidden, not deleted) comments + replies */
function mockRecount() {
  const all = g.__aisubalFeed?.posts ?? []
  const kids = all.filter((r) => r.parentId && !r.isHidden && !r.isDeleted)
  for (const p of all) {
    const n = kids.filter((r) => r.parentId === p.id || r.rootId === p.id).length
    if (p.parentId || kids.some((r) => r.rootId === p.id)) p.replyCount = n
  }
}

// ---------------------------------------------------------------- real
async function likedSet(memberId: string, ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const supabase = await sb()
  const { data } = await supabase
    .from('post_likes')
    .select('post_id')
    .eq('liker_type', 'member')
    .eq('member_id', memberId)
    .in('post_id', ids)
  return new Set((data || []).map((d: { post_id: string }) => d.post_id))
}

/** DEV mock: who wrote each group-identity post (the DB keeps it in posts.author_id) */
const mockGroupWriters = (globalThis as unknown as { __aisubalGroupWriters?: Map<string, string> }).__aisubalGroupWriters ??= new Map<string, string>()
export function mockRecordGroupWriter(postId: string, writerId: string) {
  mockGroupWriters.set(postId, writerId)
}

/**
 * Group-identity rows (B14) hide their writer: mark the viewer's own (⋯ menu) and,
 * only for that group's owner/mods, attach who wrote it. Both come from SECURITY DEFINER RPCs.
 */
export async function withGroupIdentity(viewerId: string, posts: TimelinePost[]): Promise<TimelinePost[]> {
  const ids = posts.filter((p) => p.author.kind === 'group').map((p) => p.id)
  if (!ids.length) return posts
  let mine: Set<string>
  let writers: Record<string, { id: string; name: string; handle: string | null }>
  if (isMock()) {
    const { mockGroupRoleOf } = await import('./groups')
    mine = new Set(ids.filter((id) => mockGroupWriters.get(id) === viewerId))
    writers = {}
    for (const p of posts) {
      const w = mockGroupWriters.get(p.id)
      const gid = p.author.id.replace(/^group_/, '')
      if (w && ['owner', 'mod'].includes(mockGroupRoleOf(gid, viewerId) ?? '')) {
        const m = MOCK_MEMBERS.find((x) => x.id === w)
        writers[p.id] = { id: w, name: m?.display_name ?? (w === viewerId ? '개발자' : '멤버'), handle: m?.handle ?? (w === viewerId ? 'dev' : null) }
      }
    }
  } else {
    const supabase = await sb()
    const [a, b] = await Promise.all([supabase.rpc('posts_mine', { p_ids: ids }), supabase.rpc('group_post_authors', { p_ids: ids })])
    mine = new Set(((a.data || []) as string[]).map(String))
    writers = (b.data || {}) as typeof writers
  }
  return posts.map((p) => (p.author.kind === 'group' ? { ...p, isMine: mine.has(p.id), groupWriter: writers[p.id] ?? null } : p))
}

/** Attach the viewer's follow state to real-name member authors (follow chip on cards). */
export async function withFollowState(viewerId: string, posts: TimelinePost[]): Promise<TimelinePost[]> {
  const ids = posts.filter((p) => p.author.kind === 'member' && !p.isNickname).map((p) => p.author.id)
  const rel = await getRelations(viewerId, ids).catch(() => null)
  if (!rel) return posts
  return posts.map((p) => {
    const r = p.author.kind === 'member' && !p.isNickname ? rel.get(p.author.id) : undefined
    if (!r || r.isMe) return p
    return { ...p, author: { ...p.author, follow: { following: r.iFollow, badge: relationBadge(r)?.label ?? null } } }
  })
}

export type FeedListOpts = {
  limit?: number
  before?: string
  /** numbered pages: skip this many rows */
  offset?: number
  authorId?: string
  includeNickname?: boolean
  /** 전체 | 팔로잉 | 친구 | 인기 — 팔로잉/친구 only show real-name posts by those people */
  scope?: FeedScope
  /** group timeline; when omitted, group posts are excluded */
  groupId?: string | null
  /** search: title or body contains this (already sanitized by lib/search-rules) */
  q?: string
}

async function queryFeed(viewerId: string, opts: FeedListOpts, withCount: boolean): Promise<{ posts: TimelinePost[]; total: number | null }> {
  const scope = opts.scope ?? 'all'
  if (scope === 'for_you') return queryForYou(viewerId, opts)
  const popular = scope === 'popular'
  const authorIds = scope === 'following' || scope === 'friends' ? await socialAuthorIds(viewerId, scope) : null
  const limit = Math.min(opts.limit ?? 30, 100)
  const offset = Math.max(0, opts.offset ?? 0)
  const since = new Date(Date.now() - POPULAR_DAYS * 86400_000).toISOString()
  if (isMock()) {
    const st = mockState()
    let rows = st.posts.filter(
      (p) =>
        !p.parentId &&
        (opts.groupId ? p.groupId === opts.groupId : !p.groupId) &&
        (!opts.authorId || p.author.id === opts.authorId) &&
        (!authorIds || (authorIds.includes(p.author.id) && !p.isNickname)) &&
        (!opts.before || p.createdAt < opts.before) &&
        (!opts.q || `${p.title ?? ''} ${p.body}`.toLowerCase().includes(opts.q.toLowerCase()))
    )
    if (popular) rows = [...rows].sort((a, b) => b.likeCount * 2 + b.replyCount - (a.likeCount * 2 + a.replyCount) || b.createdAt.localeCompare(a.createdAt))
    rows = rows.filter((p) => !p.isDeleted).map((p) => ({ ...p, isMine: p.author.id === viewerId }))
    return { posts: await withGroupIdentity(viewerId, await withFollowState(viewerId, rows.slice(offset, offset + limit))), total: rows.length }
  }
  if (authorIds && authorIds.length === 0) return { posts: [], total: 0 }
  const supabase = await sb()
  let q = supabase
    .from('posts')
    .select(FEED_SELECT, withCount ? { count: 'exact' } : undefined)
    .is('parent_id', null)
    .eq('is_hidden', false)
    .is('deleted_at', null)
  q = popular
    ? q.gte('created_at', since).order('like_count', { ascending: false }).order('reply_count', { ascending: false }).order('created_at', { ascending: false })
    : q.order('created_at', { ascending: false })
  q = opts.groupId ? q.eq('group_id', opts.groupId) : q.is('group_id', null)
  if (opts.before) q = q.lt('created_at', opts.before)
  if (opts.q) q = q.or(`title.ilike.%${opts.q}%,content.ilike.%${opts.q}%`)
  if (authorIds) q = q.in('public_author_id', authorIds.slice(0, 500)).eq('posted_as', 'real').eq('author_kind', 'member')
  if (opts.authorId) {
    // other people's profile pages never include 부캐 posts; my own may (0052: by my nickname_id)
    q = opts.includeNickname && opts.authorId === viewerId ? q.or(ownPostsFilter(viewerId, await myNicknameId())) : q.eq('public_author_id', opts.authorId).eq('posted_as', 'real')
  }
  const { data, error, count } = await q.range(offset, offset + limit - 1)
  if (error) throw error
  const rows = (data || []) as unknown as FeedRow[]
  const [liked, nickId] = await Promise.all([likedSet(viewerId, rows.map((r) => r.id)), myNicknameId()])
  const posts = await withFollowState(viewerId, rows.map((r) => feedRowToTimeline(r, liked, viewerId, nickId)))
  return { posts: await withGroupIdentity(viewerId, posts), total: withCount ? (count ?? null) : null }
}

/** 추천 pool size: the newest top-level posts (same filters as 전체) re-ranked per viewer. */
const FOR_YOU_POOL = 100

async function viewerInterestTags(viewerId: string): Promise<string[]> {
  if (isMock()) return pickInterestTags([['mcp', 'agent'], ['cursor', 'mcp'], ['prompt']])
  const supabase = await sb()
  const { data } = await supabase.from('archive_entries').select('tags').eq('owner_id', viewerId).limit(300)
  return pickInterestTags(((data || []) as Array<{ tags: string[] | null }>).map((r) => r.tags))
}

/** 추천: relationship + interests + engagement with recency decay (lib/recommend-rules); 관심 없음 posts and my own are skipped. */
async function queryForYou(viewerId: string, opts: FeedListOpts): Promise<{ posts: TimelinePost[]; total: number | null }> {
  const limit = Math.min(opts.limit ?? 30, 100)
  const offset = Math.max(0, opts.offset ?? 0)
  const [{ posts: pool }, following, friends, interestTags, dismissed] = await Promise.all([
    queryFeed(viewerId, { ...opts, scope: 'all', limit: FOR_YOU_POOL, offset: 0 }, false),
    socialAuthorIds(viewerId, 'following').catch(() => [] as string[]),
    socialAuthorIds(viewerId, 'friends').catch(() => [] as string[]),
    viewerInterestTags(viewerId).catch(() => [] as string[]),
    listDismissed(viewerId).catch(() => null),
  ])
  const candidates = pool.filter((p) => !p.isMine && !dismissed?.post.has(p.id))
  const ranked = rankFeedPosts(
    candidates,
    (p) => ({
      authorId: p.author.id,
      realName: p.author.kind === 'member' && !p.isNickname,
      text: `${p.title ?? ''} ${p.body}`,
      toolName: p.tool?.name ?? null,
      likeCount: p.likeCount,
      replyCount: p.replyCount,
      createdAt: p.createdAt,
    }),
    { following: new Set(following), friends: new Set(friends), interestTags }
  )
  return { posts: ranked.slice(offset, offset + limit), total: ranked.length }
}

async function listFeedTimeline__raw(viewerId: string, opts: FeedListOpts = {}): Promise<TimelinePost[]> {
  return (await queryFeed(viewerId, opts, false)).posts
}

/** One numbered page (20 per page) with the total for the page links. */
async function listFeedPage__raw(
  viewerId: string,
  opts: Omit<FeedListOpts, 'limit' | 'offset' | 'before'> & { page: number; pageSize?: number }
): Promise<{ posts: TimelinePost[]; page: number; totalPages: number; total: number }> {
  const size = opts.pageSize ?? PAGE_SIZE
  const { posts, total } = await queryFeed(viewerId, { ...opts, limit: size, offset: (opts.page - 1) * size }, true)
  const t = total ?? posts.length
  return { posts, page: opts.page, total: t, totalPages: Math.max(1, Math.ceil(t / size)) }
}

async function getFeedThread__raw(
  id: string,
  viewerId: string
): Promise<{ root: TimelinePost; replies: TimelinePost[]; isMine: boolean } | null> {
  if (isMock()) {
    const st = mockState()
    const first = st.posts.find((p) => p.id === id)
    if (!first) return null
    const root = first.rootId ? st.posts.find((p) => p.id === first.rootId) : first
    if (!root) return null
    const mine = (p: TimelinePost) => ({ ...p, isMine: p.author.id === viewerId })
    const [r0] = await withGroupIdentity(viewerId, [mine(root)])
    return { root: r0, replies: st.posts.filter((p) => p.rootId === root.id).map(mine), isMine: Boolean(r0.isMine) }
  }
  const supabase = await sb()
  const { data: first, error } = await supabase
    .from('posts')
    .select(FEED_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!first) return null
  let root = first as unknown as FeedRow
  if (root.root_id) {
    const { data: r } = await supabase
      .from('posts')
      .select(FEED_SELECT)
      .eq('id', root.root_id)
      .maybeSingle()
    if (!r) return null
    root = r as unknown as FeedRow
  }
  const { data: rep } = await supabase
    .from('posts')
    .select(FEED_SELECT)
    .eq('root_id', root.id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true })
    .limit(500)
  const replies = (rep || []) as unknown as FeedRow[]
  const [liked, nickId] = await Promise.all([likedSet(viewerId, [root.id, ...replies.map((r) => r.id)]), myNicknameId()])
  const [rootPost] = await withGroupIdentity(viewerId, [feedRowToTimeline(root, liked, viewerId, nickId)])
  return {
    root: rootPost,
    replies: replies.map((r) => feedRowToTimeline(r, liked, viewerId, nickId)),
    isMine: Boolean(rootPost.isMine),
  }
}

async function listFeedLikers__raw(postId: string): Promise<TimelineLiker[]> {
  if (isMock()) return mockState().likers.get(postId) || []
  const supabase = await sb()
  const { data, error } = await supabase
    .from('post_likes')
    .select('liker_type, member_id, token_id, agent_name, created_at, member:members!post_likes_member_id_fkey(id, display_name, avatar_url)')
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

export async function setMemberFeedLike(postId: string, memberId: string, like: boolean): Promise<number> {
  if (isMock()) {
    const p = mockState().posts.find((x) => x.id === postId)
    if (!p) throw new Error('not_found')
    if (like && p.author.id === memberId) throw new Error('self_like')
    if (p.likedByMe !== like) {
      p.likedByMe = like
      p.likeCount += like ? 1 : -1
    }
    return p.likeCount
  }
  const supabase = await sb()
  if (like) {
    const { error } = await supabase.from('post_likes').insert({ post_id: postId, liker_type: 'member', member_id: memberId })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('post_likes')
      .delete()
      .eq('post_id', postId)
      .eq('liker_type', 'member')
      .eq('member_id', memberId)
    if (error) throw error
  }
  const { data } = await supabase.from('posts').select('like_count').eq('id', postId).maybeSingle()
  return (data as { like_count: number } | null)?.like_count ?? 0
}


/** Author toggles who may interact (root posts only). */
export async function setFeedAgentInteraction(
  postId: string,
  member: Member,
  value: 'humans_only' | 'agents_allowed'
): Promise<boolean> {
  if (isMock()) {
    const p = mockState().posts.find((x) => x.id === postId)
    if (p) p.agentsAllowed = value === 'agents_allowed'
    return Boolean(p)
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('posts')
    .update({ agent_interaction: value })
    .eq('id', postId)
    .or(ownPostsFilter(member.id, member.nickname_id))
    .is('parent_id', null)
    .select('id')
  if (error) throw error
  return Boolean(data?.length)
}

/** Mock-only: append a created post/reply so DEV screens reflect writes. */
export function mockAppendFeedPost(post: TimelinePost) {
  const st = mockState()
  st.posts.unshift(post)
  if (post.parentId) mockRecount()
}

/** Mock-only: group of a post (replies inherit it, like the DB trigger). */
export function mockFeedGroupOf(postId: string): string | null {
  const st = mockState()
  const p = st.posts.find((x) => x.id === postId)
  if (!p) return null
  const root = p.rootId ? st.posts.find((x) => x.id === p.rootId) : p
  return root?.groupId ?? p.groupId ?? null
}

// ---------------------------------------------------------------- ⋯ edit / delete (0038)
export type FeedEditInput = { body: string; url: string | null; previews: import('@/lib/supabase/types').LinkPreview[] | null }

/** Author edits their own member-authored row; returns edited_at, or null when not allowed. */
export async function editFeedPost(postId: string, viewerId: string, input: FeedEditInput): Promise<string | null> {
  if (isMock()) {
    const p = mockState().posts.find((x) => x.id === postId && x.author.id === viewerId && !x.isDeleted)
    if (!p) return null
    p.body = input.body
    p.isEdited = true
    if (!p.parentId) {
      p.linkUrl = input.url
      p.linkPreviews = (input.previews ?? []).map((x) => ({ url: x.url, title: x.title, description: x.description, image: x.image, siteName: x.site_name, favicon: x.favicon, linkType: x.link_type }))
      p.linkPreview = p.linkPreviews[0] ?? null
    }
    return new Date().toISOString()
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('posts__edit', {
    p_post_id: postId,
    p_content: input.body,
    p_url: input.url,
    p_previews: input.previews && input.previews.length ? input.previews : null,
  })
  if (error) throw error
  return (data as string | null) ?? null
}

/** Author (agent rows: token owner) or admin. Rows with replies become a tombstone. */
export async function deleteFeedPost(postId: string, viewerId: string): Promise<{ ok: boolean; tombstone: boolean }> {
  if (isMock()) {
    const st = mockState()
    const p = st.posts.find((x) => x.id === postId && x.author.id === viewerId && !x.isDeleted)
    if (!p) return { ok: false, tombstone: false }
    const hasKids = st.posts.some((x) => x.parentId === postId || x.rootId === postId)
    if (hasKids) Object.assign(p, { isDeleted: true, isEdited: false, body: '', title: null, linkUrl: null, linkPreview: null, linkPreviews: [] })
    else st.posts = st.posts.filter((x) => x.id !== postId)
    mockRecount()
    return { ok: true, tombstone: hasKids }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('posts__delete', { p_post_id: postId })
  if (error) throw error
  if (!data) return { ok: false, tombstone: false }
  const { data: left } = await supabase.from('posts').select('id').eq('id', postId).maybeSingle()
  return { ok: true, tombstone: Boolean(left) }
}

// 0050: agent authors get their photo + /agents/{id} link
export async function listFeedTimeline(...args: Parameters<typeof listFeedTimeline__raw>): ReturnType<typeof listFeedTimeline__raw> {
  return withAgentCards(await listFeedTimeline__raw(...args))
}

export async function listFeedPage(...args: Parameters<typeof listFeedPage__raw>): ReturnType<typeof listFeedPage__raw> {
  const r = await listFeedPage__raw(...args)
  return { ...r, posts: await withAgentCards(r.posts) }
}

export async function getFeedThread(...args: Parameters<typeof getFeedThread__raw>): ReturnType<typeof getFeedThread__raw> {
  const r = await getFeedThread__raw(...args)
  if (!r) return r
  const [root, ...replies] = await withAgentCards([r.root, ...r.replies])
  return { ...r, root, replies }
}

export async function listFeedLikers(...args: Parameters<typeof listFeedLikers__raw>): ReturnType<typeof listFeedLikers__raw> {
  return withAgentLikerCards(await listFeedLikers__raw(...args))
}
