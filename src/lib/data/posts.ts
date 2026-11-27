import { cache } from 'react'
import type { PostVisibility } from '@/lib/post-visibility'
import { postImageSrc } from '@/lib/quick-post-rules'
import { setMockPostVisibilityDefault } from './agent-interaction-default'
import {
  MOCK_MEMBERS,
  MOCK_POSTS,
  MOCK_TRENDING,
} from '@/lib/mock-data'
import { nicknameProfilePublicId, toPublicAuthor, toPublicPost, toPublicPostView, assertNoIdentityLeak } from '@/lib/profile'
import { aggregateMentionsFromPosts } from '@/lib/data/toolbox'
import { archiveSaveCounts } from '@/lib/data/archive'
import type { AgentInteraction, Asset, LinkPreview, Member, Post, PostAs } from '@/lib/supabase/types'
import { mockAppendFeedPost, mockFeedGroupOf, mockFeedPost, mockRecordGroupWriter } from './feed'
import { normalizeReplyTarget } from '@/lib/thread'
import { sb, isMock } from './client'
import { mentionedAgentHandles } from '@/lib/agent-handle'
import { mockRecordAgentMention } from './agent-mentions'
import { MEMBER_EMBED, MEMBER_PUBLIC_COLUMNS } from './member-columns'
import type { PostWithDetails } from './types'

/** posts columns readable by members (0036/0052): author_id is the PUBLIC author (null on 부캐 rows); no agent_token_name. */
export const POST_COLUMNS =
  'id, title, content, url, link_title, link_description, link_image, link_site_name, link_favicon, link_type, link_previews, author_id:public_author_id, posted_as, is_hidden, is_agent_posted, created_at, updated_at, parent_id, root_id, reply_to_id, thread_depth, like_count, reply_count, agent_interaction, author_kind, agent_token_id, agent_name, agent_model, group_id, source_note'

export type { PostWithDetails } from './types'

type CreatePostInput = {
  /** group timeline post (top-level only; replies inherit the parent's group in the DB) */
  groupId?: string | null
  title?: string
  content: string
  /** reply target (any post in the thread). Replies skip archive auto-save. */
  parentId?: string | null
  agentInteraction?: AgentInteraction
  /** A43: 공유범위 (the route only passes a restricted value for eligible root posts) */
  visibility?: PostVisibility
  /** author-declared (0046); default human */
  sourceNote?: string
  url?: string
  linkPreview?: LinkPreview
  /** every preview, first = linkPreview (posts.link_previews, max 4) */
  linkPreviews?: LinkPreview[]
  postedAs: PostAs
  /** B14: publish under this group's identity (root posts; the DB checks owner/mod) */
  asGroup?: { id: string; slug: string; name: string } | null
  /** A97 (0129): marked with the 질문해요 button (the route only passes true for a root real-name non-group post) */
  isQuestion?: boolean
  /** A62: one uploaded image (root posts; the DB checks it is the author's own file) */
  imagePath?: string | null
  assets?: Array<{
    type: Asset['type']
    name: string
    content: string
    filename?: string
  }>
}

/** How many members saved this post into their archive (count only, never who). */
async function archiveCountForPost(postId: string): Promise<number> {
  return (await archiveSaveCounts('post', [postId]).catch(() => ({} as Record<string, number>)))[postId] ?? 0
}

const NICK_EMBED = 'id, nickname, bio, avatar_url, created_at'
type NickRow = { id: string; nickname: string; bio: string | null; avatar_url: string | null; created_at: string }

/** Real-name rows embed the member; 부캐 rows (0052) only their nickname profile — never the member. */
function authorOf(author: Member | null, nick: NickRow | null): Member | null {
  if (author) return author
  if (!nick) return null
  return {
    id: nick.id, auth_id: '', email: '', display_name: nick.nickname, handle: null, bio: null, avatar_url: null,
    nickname_id: nick.id, nickname: nick.nickname, nickname_bio: nick.bio, nickname_avatar_url: nick.avatar_url, nickname_created_at: nick.created_at,
  } as unknown as Member
}

async function hydratePost(
  post: Post,
  author: Member,
  assets: Asset[] = []
): Promise<PostWithDetails> {
  const archive_count = await archiveCountForPost(post.id)
  return {
    ...post,
    author: toPublicAuthor(author, post.posted_as),
    assets,
    archive_count,
  }
}

export async function listPosts(): Promise<PostWithDetails[]> {
  if (isMock()) return [...MOCK_POSTS]

  const supabase = await sb()
  const { data: rows, error } = await supabase
    .from('posts')
    .select(`${POST_COLUMNS}, assets(*), author:members!posts_public_author_id_fkey(${MEMBER_EMBED}), nick:nickname_profiles!posts_nickname_id_fkey(${NICK_EMBED})`)
    .eq('is_hidden', false)
    .is('parent_id', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) throw error

  const typed = (rows || []) as unknown as Array<Post & { assets: Asset[]; author: Member | null; nick: NickRow | null }>
  const out: Array<Promise<PostWithDetails>> = []
  for (const { assets, author, nick, ...post } of typed) {
    const a = authorOf(author, nick)
    if (a) out.push(hydratePost(post as Post, a, assets || []))
  }
  return Promise.all(out)
}

/** A67: page renders only (not actions/routes): the post page starts this in parallel with the thread and the view reuses it. */
export const getPostForRender = cache((id: string) => getPost(id))

export async function getPost(id: string): Promise<PostWithDetails | null> {
  if (isMock()) {
    return MOCK_POSTS.find((p) => p.id === id) ?? null
  }

  const supabase = await sb()
  const { data: row, error } = await supabase
    .from('posts')
    .select(`${POST_COLUMNS}, assets(*), author:members!posts_public_author_id_fkey(${MEMBER_EMBED}), nick:nickname_profiles!posts_nickname_id_fkey(${NICK_EMBED})`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const { assets, author, nick, ...post } = row as unknown as Post & {
    assets: Asset[]
    author: Member | null
    nick: NickRow | null
  }
  const a = authorOf(author, nick)
  if (!a) return null
  return hydratePost(post, a, assets || [])
}

export async function listTrendingPosts(limit = 5): Promise<PostWithDetails[]> {
  if (isMock()) return MOCK_TRENDING.slice(0, limit)

  const posts = await listPosts()
  return posts
    .slice()
    .sort((a, b) => b.archive_count - a.archive_count)
    .slice(0, limit)
}

export async function getPostAsset(
  postId: string,
  assetId: string
): Promise<Asset | null> {
  if (isMock()) {
    const post = MOCK_POSTS.find((p) => p.id === postId)
    return post?.assets.find((a) => a.id === assetId) ?? null
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('assets')
    .select('*')
    .eq('post_id', postId)
    .eq('id', assetId)
    .maybeSingle()
  if (error) throw error
  return (data as Asset) ?? null
}

export async function createPost(
  member: Member,
  input: CreatePostInput
): Promise<{ post: ReturnType<typeof toPublicPost>; details: PostWithDetails }> {
  const lp = input.linkPreview

  if (isMock()) {
    const post: Post = {
      id: `post-${Date.now()}`,
      title: input.title || '',
      content: input.content,
      source_note: input.sourceNote || null,
      url: input.url || lp?.url || null,
      link_title: lp?.title || null,
      link_description: lp?.description || null,
      link_image: lp?.image || null,
      link_site_name: lp?.site_name || null,
      link_favicon: lp?.favicon || null,
      link_type: lp?.link_type || null,
      author_id: member.id,
      posted_as: input.postedAs,
      nickname_profile_id:
        input.postedAs === 'nickname' && member.nickname_id ? nicknameProfilePublicId(member.nickname_id) : null,
      is_hidden: false,
      is_agent_posted: false,
      agent_token_name: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const assets: Asset[] = (input.assets || []).map((a, i) => ({
      id: `asset-${Date.now()}-${i}`,
      post_id: post.id,
      type: a.type,
      name: a.name,
      content: a.content,
      filename: a.filename || null,
      created_at: post.created_at,
      updated_at: post.updated_at,
    }))
    const pub = toPublicPost(post, member)
    assertNoIdentityLeak(pub, [member.email])
    const details: PostWithDetails = {
      ...post,
      author: pub.author,
      assets,
      archive_count: 0,
    }
    const parentId = input.parentId || null
    const parentGroup = parentId ? mockFeedGroupOf(parentId) : null
    const nest = parentId ? normalizeReplyTarget(mockFeedPost(parentId)) : null
    mockAppendFeedPost({
      groupId: parentGroup ?? input.groupId ?? null,
      id: post.id,
      parentId: nest?.parentId ?? parentId,
      rootId: nest?.rootId ?? parentId,
      replyToId: nest?.replyToId ?? undefined,
      author: input.asGroup
        ? { kind: 'group', id: `group_${input.asGroup.id}`, name: input.asGroup.name, profileHref: `/groups/${input.asGroup.slug}` }
        : { kind: 'member', id: pub.author.id, name: pub.author.kind === 'nickname' ? pub.author.nickname : pub.author.display_name, avatarUrl: pub.author.avatar_url, handle: pub.author.kind === 'real' ? member.handle : undefined },
      title: post.title || null,
      body: post.content,
      linkUrl: post.url,
      imageUrl: input.imagePath ? postImageSrc(post.id) : null,
      imagePath: input.imagePath ? input.imagePath : undefined,
      linkPreview: lp ? { url: lp.url, title: lp.title, description: lp.description, image: lp.image, siteName: lp.site_name, favicon: lp.favicon, linkType: lp.link_type } : null,
      linkPreviews: (input.linkPreviews ?? []).map((x) => ({ url: x.url, title: x.title, description: x.description, image: x.image, siteName: x.site_name, favicon: x.favicon, linkType: x.link_type })),
      tool: null,
      rating: null,
      likeCount: 0,
      likedByMe: false,
      replyCount: 0,
      createdAt: post.created_at,
      agentsAllowed: !parentId && input.agentInteraction === 'agents_allowed',
      isNickname: input.postedAs === 'nickname',
      visibility: parentId ? mockFeedPost(parentId)?.visibility ?? 'members' : input.visibility ?? 'members',
      isQuestion: Boolean(input.isQuestion) && !parentId && !input.groupId && !input.asGroup && input.postedAs === 'real',
    })
    if (!parentId && !input.groupId && !input.asGroup && input.postedAs === 'real') setMockPostVisibilityDefault(input.visibility ?? 'members')
    if (input.asGroup) mockRecordGroupWriter(post.id, member.id)
    const rootId = nest?.rootId ?? parentId ?? post.id
    for (const handle of mentionedAgentHandles(input.content)) {
      if (handle !== '야간_리서처') continue
      mockRecordAgentMention({
        tokenId: 'token-1',
        mentionId: `mention-${post.id}`,
        kind: 'feed',
        id: post.id,
        rootId,
        url: `/posts/${rootId}`,
        actor: { kind: 'member', name: member.display_name || member.handle || '멤버', handle: member.handle ?? undefined },
        body: input.content,
        createdAt: post.created_at,
      })
    }
    if (parentId || input.groupId || input.asGroup) return { post: pub, details }
    MOCK_POSTS.unshift(details)
    await aggregateMentionsFromPosts([details])
    return { post: pub, details }
  }

  const supabase = await sb()
  const { data: inserted, error } = await supabase
    .from('posts')
    .insert({
      title: input.title || '',
      content: input.content,
      parent_id: input.parentId || null,
      group_id: input.parentId ? null : input.groupId || null,
      agent_interaction: input.parentId || input.groupId ? 'humans_only' : input.agentInteraction || 'agents_allowed',
      source_note: input.sourceNote || null,
      url: input.url || lp?.url || null,
      link_title: lp?.title || null,
      link_description: lp?.description || null,
      link_image: lp?.image || null,
      link_site_name: lp?.site_name || null,
      link_favicon: lp?.favicon || null,
      link_type: lp?.link_type || null,
      link_previews: input.linkPreviews?.length ? input.linkPreviews.slice(0, 4) : null,
      author_id: member.id,
      posted_as: input.asGroup && !input.parentId ? 'group' : input.postedAs,
      as_group_id: input.asGroup && !input.parentId ? input.asGroup.id : null,
      ...(input.visibility && input.visibility !== 'members' && !input.parentId ? { visibility: input.visibility } : {}),
      ...(input.imagePath ? { image_path: input.imagePath } : {}),
      ...(input.isQuestion && !input.parentId ? { is_question: true } : {}),
    })
    .select(POST_COLUMNS)
    .single()

  if (error) throw error
  const post = inserted as Post

  let assets: Asset[] = []
  if (input.assets?.length) {
    const { data: assetRows, error: assetErr } = await supabase
      .from('assets')
      .insert(
        input.assets.map((a) => ({
          post_id: post.id,
          type: a.type,
          name: a.name,
          content: a.content,
          filename: a.filename || null,
        }))
      )
      .select('*')
    if (assetErr) throw assetErr
    assets = (assetRows || []) as Asset[]
  }

  const pub = toPublicPost(post, member)
  assertNoIdentityLeak(pub, [member.email])
  const details = await hydratePost(post, member, assets)
  // replies and group posts are not counted in mention stats
  if (post.parent_id || input.groupId) return { post: pub, details }

  await aggregateMentionsFromPosts([details])

  return { post: pub, details }
}

export async function deletePost(id: string, memberId: string): Promise<boolean> {
  if (isMock()) {
    const idx = MOCK_POSTS.findIndex((p) => p.id === id)
    if (idx < 0) return false
    if (MOCK_POSTS[idx].author_id !== memberId) return false
    MOCK_POSTS.splice(idx, 1)
    return true
  }

  // no direct DELETE grant on posts (0036): owner/admin delete via RPC
  void memberId
  const supabase = await sb()
  const { data, error } = await supabase.rpc('posts__delete', { p_post_id: id })
  if (error) throw error
  return data === true
}

/** Resolve author Member for a post (mock or supabase). */
export async function getPostAuthorMember(authorId: string | null): Promise<Member | null> {
  if (!authorId) return null // 0052: 부캐 rows carry no public author
  if (isMock()) {
    return MOCK_MEMBERS.find((m) => m.id === authorId) ?? null
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_PUBLIC_COLUMNS)
    .eq('id', authorId)
    .maybeSingle()
  if (error) throw error
  return data ? ({ email: '', ...(data as object) } as Member) : null
}

export async function listPublicPosts() {
  const posts = await listPosts()
  return posts.map((p) => {
    const pub = toPublicPostView(p, { archive_count: p.archive_count })
    assertNoIdentityLeak(pub, p.posted_as === 'nickname' && p.author_id ? [p.author_id] : [])
    return pub
  })
}
