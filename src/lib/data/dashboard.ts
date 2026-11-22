import type { Member } from '@/lib/supabase/types'
import { ownPostsFilter } from './own-posts'
import { myNicknameId } from './nickname'
import { PAGE_SIZE } from '@/lib/paging'
import { sb, useMockData as isMock } from './client'
import { listFeedTimeline } from './feed'

export type DashItem = {
  id: string
  href: string
  title: string | null
  body: string
  createdAt: string
  likeCount: number
  replyCount: number
  isNickname: boolean
  /** liked posts: who wrote it */
  authorName?: string | null
}

export type DashboardStats = {
  posts: number
  comments: number
  likesReceived: number
  likesGiven: number
}

type PostRow = {
  id: string
  root_id: string | null
  parent_id: string | null
  title: string | null
  content: string | null
  link_title: string | null
  url: string | null
  posted_as: string
  like_count: number | null
  reply_count: number | null
  created_at: string
  author?: { display_name: string | null } | null
}

const text = (r: PostRow) => (r.content || r.link_title || r.url || '').slice(0, 280)

const MOCK_COMMENTS: DashItem[] = Array.from({ length: 24 }, (_, i) => ({
  id: `c-${i + 1}`,
  href: `/posts/post-${(i % 5) + 1}`,
  title: null,
  body: ['좋은 정리 감사해요! 저도 이 MCP 써봐야겠네요.', 'Cursor rules 글롭 팁 덕분에 컨텍스트가 확 줄었어요.', '혹시 설정 파일 공유 가능할까요?'][i % 3],
  createdAt: new Date(Date.now() - (i + 1) * 5 * 3600_000).toISOString(),
  likeCount: i % 4,
  replyCount: 0,
  isNickname: i % 7 === 3,
}))

export async function getDashboardStats(member: Member, likesReceived: number, posts: number): Promise<DashboardStats> {
  if (isMock()) return { posts, comments: MOCK_COMMENTS.length, likesReceived, likesGiven: 2 }
  const supabase = await sb()
  const [c, l] = await Promise.all([
    supabase.from('posts').select('id', { count: 'exact', head: true }).or(ownPostsFilter(member.id, member.nickname_id)).eq('author_kind', 'member').not('parent_id', 'is', null),
    supabase.from('post_likes').select('id', { count: 'exact', head: true }).eq('liker_type', 'member').eq('member_id', member.id),
  ])
  return { posts, comments: c.count ?? 0, likesReceived, likesGiven: l.count ?? 0 }
}

/** My replies (real-name and 부캐) — only I ever see this list. */
export async function listMyComments(memberId: string, page: number, size = PAGE_SIZE): Promise<{ items: DashItem[]; totalPages: number }> {
  if (isMock()) {
    return { items: MOCK_COMMENTS.slice((page - 1) * size, page * size), totalPages: Math.max(1, Math.ceil(MOCK_COMMENTS.length / size)) }
  }
  const supabase = await sb()
  const { data, count, error } = await supabase
    .from('posts')
    .select('id, root_id, parent_id, title, content, link_title, url, posted_as, like_count, reply_count, created_at', { count: 'exact' })
    .or(ownPostsFilter(memberId, await myNicknameId()))
    .eq('author_kind', 'member')
    .not('parent_id', 'is', null)
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1)
  if (error) throw error
  const items = ((data || []) as PostRow[]).map((r) => ({
    id: r.id,
    href: `/posts/${r.root_id || r.parent_id || r.id}`,
    title: null,
    body: text(r),
    createdAt: r.created_at,
    likeCount: r.like_count ?? 0,
    replyCount: r.reply_count ?? 0,
    isNickname: r.posted_as === 'nickname',
  }))
  return { items, totalPages: Math.max(1, Math.ceil((count ?? 0) / size)) }
}

/** Posts I liked, newest like first. Nickname authors stay unnamed. */
export async function listMyLikedPosts(memberId: string, page: number, size = PAGE_SIZE): Promise<{ items: DashItem[]; totalPages: number }> {
  if (isMock()) {
    const liked = (await listFeedTimeline(memberId, { limit: 100 })).filter((p) => p.likedByMe)
    return {
      items: liked.slice((page - 1) * size, page * size).map((p) => ({
        id: p.id,
        href: `/posts/${p.id}`,
        title: p.title ?? null,
        body: p.body || p.linkPreview?.title || p.linkUrl || '',
        createdAt: p.createdAt,
        likeCount: p.likeCount,
        replyCount: p.replyCount,
        isNickname: Boolean(p.isNickname),
        authorName: p.author.name,
      })),
      totalPages: Math.max(1, Math.ceil(liked.length / size)),
    }
  }
  const supabase = await sb()
  const { data: likes, count, error } = await supabase
    .from('post_likes')
    .select('post_id, created_at', { count: 'exact' })
    .eq('liker_type', 'member')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false })
    .range((page - 1) * size, page * size - 1)
  if (error) throw error
  const ids = ((likes || []) as Array<{ post_id: string }>).map((l) => l.post_id)
  if (!ids.length) return { items: [], totalPages: Math.max(1, Math.ceil((count ?? 0) / size)) }
  const { data: rows } = await supabase
    .from('posts')
    .select('id, root_id, parent_id, title, content, link_title, url, posted_as, like_count, reply_count, created_at, author:members!posts_public_author_id_fkey(display_name)')
    .in('id', ids)
  const byId = new Map(((rows || []) as unknown as PostRow[]).map((r) => [r.id, r]))
  const items = ids
    .map((id) => byId.get(id))
    .filter((r): r is PostRow => !!r)
    .map((r) => ({
      id: r.id,
      href: `/posts/${r.root_id || r.parent_id || r.id}`,
      title: r.title,
      body: text(r),
      createdAt: r.created_at,
      likeCount: r.like_count ?? 0,
      replyCount: r.reply_count ?? 0,
      isNickname: r.posted_as === 'nickname',
      authorName: r.posted_as === 'nickname' ? '부캐' : (r.author?.display_name ?? null),
    }))
  return { items, totalPages: Math.max(1, Math.ceil((count ?? 0) / size)) }
}
