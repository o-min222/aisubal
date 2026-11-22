import type { TimelineLiker, TimelinePost } from '@/components/timeline/types'
import { feedRowToTimeline, type FeedRow } from '@/lib/feed-rules'
import { MOCK_MEMBERS, MOCK_POSTS } from '@/lib/mock-data'
import { toPublicAuthor, publicAuthorLabel } from '@/lib/profile'
import type { Member } from '@/lib/supabase/types'
import { relationBadge, type FeedScope } from '@/lib/social-rules'
import { sb, useMockData as isMock } from './client'
import { getRelations, socialAuthorIds } from './social'

const FEED_SELECT =
  'id, parent_id, root_id, title, content, url, link_title, link_description, link_image, link_site_name, link_favicon, link_type, posted_as, author_kind, agent_name, agent_model, agent_token_id, agent_interaction, like_count, reply_count, is_hidden, created_at, group_id, author:members!posts_author_id_fkey(id, display_name, handle, avatar_url, nickname, nickname_avatar_url)'

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
          replyCount: 1,
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
  return g.__aisubalFeed
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

export async function listFeedTimeline(
  viewerId: string,
  opts: {
    limit?: number
    before?: string
    authorId?: string
    includeNickname?: boolean
    /** 전체 | 팔로잉 | 친구 — the last two only show real-name posts by those people */
    scope?: FeedScope
    /** group timeline; when omitted, group posts are excluded */
    groupId?: string | null
  } = {}
): Promise<TimelinePost[]> {
  const scope = opts.scope ?? 'all'
  const authorIds = scope === 'all' ? null : await socialAuthorIds(viewerId, scope)
  if (isMock()) {
    const st = mockState()
    const rows = st.posts.filter(
      (p) =>
        !p.parentId &&
        (opts.groupId ? p.groupId === opts.groupId : !p.groupId) &&
        (!opts.authorId || p.author.id === opts.authorId) &&
        (!authorIds || (authorIds.includes(p.author.id) && !p.isNickname))
    )
    return withFollowState(viewerId, rows)
  }
  if (authorIds && authorIds.length === 0) return []
  const supabase = await sb()
  let q = supabase
    .from('posts')
    .select(FEED_SELECT)
    .is('parent_id', null)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(Math.min(opts.limit ?? 30, 100))
  q = opts.groupId ? q.eq('group_id', opts.groupId) : q.is('group_id', null)
  if (opts.before) q = q.lt('created_at', opts.before)
  if (authorIds) q = q.in('author_id', authorIds.slice(0, 500)).eq('posted_as', 'real').eq('author_kind', 'member')
  if (opts.authorId) {
    q = q.eq('author_id', opts.authorId)
    // other people's profile pages must never reveal their nickname posts
    if (!opts.includeNickname) q = q.eq('posted_as', 'real')
  }
  const { data, error } = await q
  if (error) throw error
  const rows = (data || []) as unknown as FeedRow[]
  const liked = await likedSet(viewerId, rows.map((r) => r.id))
  return withFollowState(viewerId, rows.map((r) => feedRowToTimeline(r, liked)))
}

export async function getFeedThread(
  id: string,
  viewerId: string
): Promise<{ root: TimelinePost; replies: TimelinePost[]; isMine: boolean } | null> {
  if (isMock()) {
    const st = mockState()
    const first = st.posts.find((p) => p.id === id)
    if (!first) return null
    const root = first.rootId ? st.posts.find((p) => p.id === first.rootId) : first
    if (!root) return null
    return { root, replies: st.posts.filter((p) => p.rootId === root.id), isMine: false }
  }
  const supabase = await sb()
  const { data: first, error } = await supabase
    .from('posts')
    .select(`${FEED_SELECT}, author_id`)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!first) return null
  let root = first as unknown as FeedRow & { author_id: string }
  if (root.root_id) {
    const { data: r } = await supabase
      .from('posts')
      .select(`${FEED_SELECT}, author_id`)
      .eq('id', root.root_id)
      .maybeSingle()
    if (!r) return null
    root = r as unknown as FeedRow & { author_id: string }
  }
  const { data: rep } = await supabase
    .from('posts')
    .select(FEED_SELECT)
    .eq('root_id', root.id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true })
    .limit(500)
  const replies = (rep || []) as unknown as FeedRow[]
  const liked = await likedSet(viewerId, [root.id, ...replies.map((r) => r.id)])
  return {
    root: feedRowToTimeline(root, liked),
    replies: replies.map((r) => feedRowToTimeline(r, liked)),
    isMine: root.author_id === viewerId,
  }
}

export async function listFeedLikers(postId: string): Promise<TimelineLiker[]> {
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
    .eq('author_id', member.id)
    .is('parent_id', null)
    .select('id')
  if (error) throw error
  return Boolean(data?.length)
}

/** Mock-only: append a created post/reply so DEV screens reflect writes. */
export function mockAppendFeedPost(post: TimelinePost) {
  const st = mockState()
  st.posts.unshift(post)
  if (post.parentId) {
    for (const p of st.posts) if (p.id === post.parentId || p.id === post.rootId) p.replyCount += 1
  }
}

/** Mock-only: group of a post (replies inherit it, like the DB trigger). */
export function mockFeedGroupOf(postId: string): string | null {
  const st = mockState()
  const p = st.posts.find((x) => x.id === postId)
  if (!p) return null
  const root = p.rootId ? st.posts.find((x) => x.id === p.rootId) : p
  return root?.groupId ?? p.groupId ?? null
}
