import {
  aggregateMentionsFromPosts as mockAggregate,
  featuredToolbox as mockFeatured,
  getToolboxEntry as mockGetEntry,
  listToolbox as mockList,
  MUTABLE_COMPAT,
  MUTABLE_REVIEWS,
  MUTABLE_TOOLBOX,
} from '@/lib/mock-toolbox'
import {
  compatSummary,
  recomputeRating,
  recordMention,
  sortEntries,
  type ToolboxSort,
} from '@/lib/toolbox-rules'
import type {
  Post,
  ToolboxCompatVote,
  ToolboxEntry,
  ToolboxEnvironment,
  ToolboxMention,
  ToolboxReview,
} from '@/lib/supabase/types'
import { sb, useMockData as isMock } from './client'
import type { ToolboxEntryDetails } from './types'
import { msg } from '@/i18n/translate'

export type { ToolboxEntryDetails } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function listToolbox(opts?: {
  type?: string
  tag?: string
  q?: string
  sort?: ToolboxSort
}): Promise<ToolboxEntry[]> {
  if (isMock()) return mockList(opts)

  const supabase = await sb()
  let query = supabase.from('toolbox_entries').select('*')
  if (opts?.type) query = query.eq('type', opts.type)
  if (opts?.tag) query = query.contains('tags', [opts.tag])
  const { data, error } = await query
  if (error) throw error

  let list = (data || []) as ToolboxEntry[]
  if (opts?.q) {
    const q = opts.q.toLowerCase()
    list = list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.one_liner.toLowerCase().includes(q) ||
        e.tags.some((t) => t.toLowerCase().includes(q))
    )
  }
  return sortEntries(list, opts?.sort || 'trending')
}

export async function featuredToolbox(limit = 4): Promise<ToolboxEntry[]> {
  if (isMock()) return mockFeatured(limit)
  const list = await listToolbox({ sort: 'trending' })
  return list.filter((e) => e.featured).slice(0, limit)
}

/** Old gallery slug → current slug (0035 toolbox_slug_redirects), or null. */
export async function galleryRedirectSlug(oldSlug: string): Promise<string | null> {
  if (isMock() || UUID_RE.test(oldSlug)) return null
  const supabase = await sb()
  const { data } = await supabase
    .from('toolbox_slug_redirects')
    .select('entry:toolbox_entries(slug)')
    .eq('old_slug', oldSlug)
    .maybeSingle()
  const entry = (data as { entry?: { slug?: string } | null } | null)?.entry
  return entry?.slug ?? null
}

export async function getToolboxEntry(
  idOrSlug: string
): Promise<ToolboxEntryDetails | null> {
  if (isMock()) return mockGetEntry(idOrSlug)

  const supabase = await sb()
  const { data: entry, error } = await supabase
    .from('toolbox_entries')
    .select('*')
    .eq(UUID_RE.test(idOrSlug) ? 'id' : 'slug', idOrSlug)
    .maybeSingle()
  if (error) throw error
  if (!entry) return null

  const e = entry as ToolboxEntry
  const [{ data: mentions }, { data: reviews }, { data: compat }] = await Promise.all([
    supabase.from('toolbox_mentions').select('*').eq('entry_id', e.id),
    supabase.from('toolbox_reviews').select('*').eq('entry_id', e.id),
    supabase.from('toolbox_compat_votes').select('*').eq('entry_id', e.id),
  ])

  const reviewRows = (reviews || []) as ToolboxReview[]
  const rating = recomputeRating(reviewRows, e.id)

  return {
    ...e,
    avg_rating: rating.count ? rating.avg : e.avg_rating,
    rating_count: rating.count || e.rating_count,
    mentions: (mentions || []) as ToolboxMention[],
    reviews: reviewRows,
    compat: compatSummary((compat || []) as ToolboxCompatVote[], e.id),
  }
}

export async function recordToolboxInstall(
  idOrSlug: string
): Promise<ToolboxEntryDetails> {
  if (isMock()) {
    const entry = MUTABLE_TOOLBOX.find((e) => e.id === idOrSlug || e.slug === idOrSlug)
    if (!entry) throw new Error(msg('항목을 찾을 수 없습니다.'))
    entry.install_count += 1
    entry.updated_at = new Date().toISOString()
    return mockGetEntry(entry.id)!
  }

  const current = await getToolboxEntry(idOrSlug)
  if (!current) throw new Error(msg('항목을 찾을 수 없습니다.'))
  const supabase = await sb()
  const { error } = await supabase.rpc('toolbox__record_install', { p_entry_id: current.id })
  if (error) throw error
  return (await getToolboxEntry(current.id))!
}

export async function upsertToolboxReview(
  entryId: string,
  memberId: string,
  rating: number,
  body: string
): Promise<ToolboxEntryDetails> {
  if (isMock()) {
    const entry = MUTABLE_TOOLBOX.find((e) => e.id === entryId || e.slug === entryId)
    if (!entry) throw new Error(msg('항목을 찾을 수 없습니다.'))
    const idx = MUTABLE_REVIEWS.findIndex(
      (r) => r.entry_id === entry.id && r.member_id === memberId
    )
    const now = new Date().toISOString()
    if (idx >= 0) {
      MUTABLE_REVIEWS[idx] = {
        ...MUTABLE_REVIEWS[idx],
        rating,
        body,
        updated_at: now,
      }
    } else {
      MUTABLE_REVIEWS.push({
        id: `tr-${Date.now()}`,
        entry_id: entry.id,
        member_id: memberId,
        rating,
        body,
        created_at: now,
        updated_at: now,
      })
    }
    const ratingInfo = recomputeRating(MUTABLE_REVIEWS, entry.id)
    entry.avg_rating = ratingInfo.avg
    entry.rating_count = ratingInfo.count
    return mockGetEntry(entry.id)!
  }

  const current = await getToolboxEntry(entryId)
  if (!current) throw new Error(msg('항목을 찾을 수 없습니다.'))
  const supabase = await sb()
  const { error } = await supabase.from('toolbox_reviews').upsert(
    {
      entry_id: current.id,
      member_id: memberId,
      rating,
      body,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'entry_id,member_id' }
  )
  if (error) throw error

  // avg_rating / rating_count are kept by the toolbox_reviews_counter trigger

  return (await getToolboxEntry(current.id))!
}

export async function voteToolboxCompat(
  entryId: string,
  memberId: string,
  environment: ToolboxEnvironment,
  works: boolean
): Promise<ToolboxEntryDetails> {
  if (isMock()) {
    const entry = MUTABLE_TOOLBOX.find((e) => e.id === entryId || e.slug === entryId)
    if (!entry) throw new Error(msg('항목을 찾을 수 없습니다.'))
    const idx = MUTABLE_COMPAT.findIndex(
      (c) =>
        c.entry_id === entry.id &&
        c.member_id === memberId &&
        c.environment === environment
    )
    const vote: ToolboxCompatVote = {
      id: `tc-${Date.now()}`,
      entry_id: entry.id,
      member_id: memberId,
      environment,
      works,
      created_at: new Date().toISOString(),
    }
    if (idx >= 0) MUTABLE_COMPAT[idx] = vote
    else MUTABLE_COMPAT.push(vote)
    return mockGetEntry(entry.id)!
  }

  const current = await getToolboxEntry(entryId)
  if (!current) throw new Error(msg('항목을 찾을 수 없습니다.'))
  const supabase = await sb()
  const { error } = await supabase.from('toolbox_compat_votes').upsert(
    {
      entry_id: current.id,
      member_id: memberId,
      environment,
      works,
    },
    { onConflict: 'entry_id,member_id,environment' }
  )
  if (error) throw error
  return (await getToolboxEntry(current.id))!
}

/** Scan posts for tool URLs and upsert mentions (idempotent). */
export async function aggregateMentionsFromPosts(
  posts: Array<Pick<Post, 'id' | 'url' | 'link_title' | 'link_description' | 'link_favicon'>> = []
) {
  if (isMock()) {
    mockAggregate(posts as Parameters<typeof mockAggregate>[0])
    return
  }

  const { isToolishUrl } = await import('@/lib/toolbox-rules')
  const supabase = await sb()

  // Links my post to an existing gallery entry (0036 RPC). New entries only come
  // from reviewed submissions, so unknown URLs are no longer auto-created here.
  for (const post of posts) {
    if (!post.url || !isToolishUrl(post.url)) continue
    await supabase.rpc('toolbox__record_post_mention', { p_post_id: post.id })
  }

  // silence unused in mock-only path helpers
  void recordMention
}
