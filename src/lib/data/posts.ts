import {
  MOCK_MEMBERS,
  MOCK_POSTS,
  MOCK_TRENDING,
} from '@/lib/mock-data'
import { nicknameProfilePublicId, toPublicAuthor, toPublicPost, assertNoIdentityLeak } from '@/lib/profile'
import { aggregateMentionsFromPosts } from '@/lib/data/toolbox'
import { saveAnything } from '@/lib/data/archive'
import type { Asset, LinkPreview, Member, Post, PostAs } from '@/lib/supabase/types'
import { sb, useMockData } from './client'
import { MEMBER_EMBED, MEMBER_PUBLIC_COLUMNS } from './member-columns'
import type { PostWithDetails } from './types'

export type { PostWithDetails } from './types'

type CreatePostInput = {
  title: string
  content: string
  sourceNote?: string
  url?: string
  linkPreview?: LinkPreview
  postedAs: PostAs
  assets?: Array<{
    type: Asset['type']
    name: string
    content: string
    filename?: string
  }>
}

async function archiveCountForPost(postId: string): Promise<number> {
  const supabase = await sb()
  const { count, error } = await supabase
    .from('brain_archive_items')
    .select('id', { count: 'exact', head: true })
    .in('source_type', ['post', 'link'])
    .eq('source_id', postId)
  if (error) return 0
  return count ?? 0
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
  if (useMockData()) return [...MOCK_POSTS]

  const supabase = await sb()
  const { data: rows, error } = await supabase
    .from('posts')
    .select(`*, assets(*), author:members!posts_author_id_fkey(${MEMBER_EMBED})`)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })

  if (error) throw error

  const typed = (rows || []) as Array<Post & { assets: Asset[]; author: Member }>
  return Promise.all(
    typed
      .filter((row) => row.author)
      .map(({ assets, author, ...post }) => hydratePost(post as Post, author, assets || []))
  )
}

export async function getPost(id: string): Promise<PostWithDetails | null> {
  if (useMockData()) {
    return MOCK_POSTS.find((p) => p.id === id) ?? null
  }

  const supabase = await sb()
  const { data: row, error } = await supabase
    .from('posts')
    .select(`*, assets(*), author:members!posts_author_id_fkey(${MEMBER_EMBED})`)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  if (!row) return null

  const { assets, author, ...post } = row as Post & {
    assets: Asset[]
    author: Member
  }
  if (!author) return null
  return hydratePost(post, author, assets || [])
}

export async function listTrendingPosts(limit = 5): Promise<PostWithDetails[]> {
  if (useMockData()) return MOCK_TRENDING.slice(0, limit)

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
  if (useMockData()) {
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

  if (useMockData()) {
    const post: Post = {
      id: `post-${Date.now()}`,
      title: input.title,
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
        input.postedAs === 'nickname' ? nicknameProfilePublicId(member.id) : null,
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
    MOCK_POSTS.unshift(details)
    await aggregateMentionsFromPosts([details])
    await saveAnything(member, {
      source_type: post.url ? 'link' : 'post',
      source_id: post.id,
      title: post.title,
      summary: post.link_description || post.content.slice(0, 140),
      content_text: post.content,
      source_url: post.url,
      extracted_text: post.url
        ? `[Auto-fetched excerpt]\n${post.link_description || ''}`
        : null,
      tags: ['내글'],
      note: '내 게시물 자동 저장',
    })
    return { post: pub, details }
  }

  const supabase = await sb()
  const { data: inserted, error } = await supabase
    .from('posts')
    .insert({
      title: input.title,
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
        input.postedAs === 'nickname' ? nicknameProfilePublicId(member.id) : null,
    })
    .select('*')
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

  await aggregateMentionsFromPosts([details])
  await saveAnything(member, {
    source_type: post.url ? 'link' : 'post',
    source_id: post.id,
    title: post.title,
    summary: post.link_description || post.content.slice(0, 140),
    content_text: post.content,
    source_url: post.url,
    extracted_text: post.url
      ? `[Auto-fetched excerpt]\n${post.link_description || ''}`
      : null,
    tags: ['내글'],
    note: '내 게시물 자동 저장',
  })

  return { post: pub, details }
}

export async function deletePost(id: string, memberId: string): Promise<boolean> {
  if (useMockData()) {
    const idx = MOCK_POSTS.findIndex((p) => p.id === id)
    if (idx < 0) return false
    if (MOCK_POSTS[idx].author_id !== memberId) return false
    MOCK_POSTS.splice(idx, 1)
    return true
  }

  const supabase = await sb()
  const { error, count } = await supabase
    .from('posts')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('author_id', memberId)
  if (error) throw error
  return (count ?? 0) > 0
}

/** Resolve author Member for a post (mock or supabase). */
export async function getPostAuthorMember(authorId: string): Promise<Member | null> {
  if (useMockData()) {
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
  const authors = await Promise.all(posts.map((p) => getPostAuthorMember(p.author_id)))
  const result = []
  for (const [i, p] of posts.entries()) {
    const authorMember = authors[i]
    if (!authorMember) continue
    const pub = toPublicPost(p, authorMember, { archive_count: p.archive_count })
    assertNoIdentityLeak(pub, [authorMember.email])
    result.push(pub)
  }
  return result
}
