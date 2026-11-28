import { sb, isMock } from './client'
import { mockFeedPost } from './feed'
import { canOfferTeaser, teaserExcerpt, TEASER_SLUG } from '@/lib/teaser-rules'

/** A56: opt-in blur teasers (0106). The excerpt is cut in the database; the full body never leaves it. */
type Teaser = {
  title: string | null
  excerpt: string
  more: boolean
  author: { name: string; avatar: string | null }
  likes: number
  replies: number
  created_at: string
  /** only for signed-in members (0107), so they can jump to the post */
  post?: string | null
}
type TeaserState = { eligible: boolean; slug: string | null }

type Mock = Map<string, string> // slug → post id
function mock(): Mock {
  const g = globalThis as unknown as { __aisubalTeasers?: Mock }
  g.__aisubalTeasers ??= new Map()
  return g.__aisubalTeasers
}
const slugOf = (postId: string) => [...mock()].find(([, id]) => id === postId)?.[0] ?? null

export async function getTeaser(slug: string): Promise<Teaser | null> {
  if (!TEASER_SLUG.test(slug)) return null
  if (isMock()) {
    const id = mock().get(slug)
    const p = id ? mockFeedPost(id) : undefined
    if (!p) return null
    const { excerpt, more } = teaserExcerpt(p.body ?? '')
    return { title: p.title ?? null, excerpt, more, author: { name: p.author.name, avatar: p.author.avatarUrl ?? null }, likes: (p.likeCount ?? 0) + (p.reactionCount ?? 0), replies: p.replyCount ?? 0, created_at: p.createdAt, post: p.id }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('teaser_public', { p_slug: slug })
  if (error) throw error
  return (data as Teaser | null) ?? null
}

export async function getTeaserState(postId: string, memberId: string): Promise<TeaserState | null> {
  if (isMock()) {
    const p = mockFeedPost(postId)
    return p && p.author.id === memberId ? { eligible: canOfferTeaser({ ...p, isMine: true }), slug: slugOf(postId) } : null
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('teaser_mine', { p_post: postId })
  if (error) throw error
  return (data as TeaserState | null) ?? null
}

export class TeaserError extends Error {}

export async function enableTeaser(postId: string, memberId: string): Promise<string> {
  if (isMock()) {
    const p = mockFeedPost(postId)
    if (!p || p.author.id !== memberId) throw new TeaserError('forbidden')
    if (!canOfferTeaser({ ...p, isMine: true })) throw new TeaserError('teaser_ineligible')
    const have = slugOf(postId)
    if (have) return have
    const slug = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    mock().set(slug, postId)
    return slug
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('teaser_enable', { p_post: postId })
  if (error) throw new TeaserError(error.message)
  return data as string
}

export async function disableTeaser(postId: string): Promise<boolean> {
  if (isMock()) {
    const s = slugOf(postId)
    if (s) mock().delete(s)
    return Boolean(s)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('teaser_disable', { p_post: postId })
  if (error) throw new TeaserError(error.message)
  return data === true
}
