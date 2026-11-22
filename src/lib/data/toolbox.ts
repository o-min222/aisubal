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
  canonicalUrl,
  compatSummary,
  extractGithubOwnerRepo,
  inferToolboxType,
  recomputeRating,
  recordMention,
  sortEntries,
  type ToolboxSort,
  upsertByCanonicalUrl,
} from '@/lib/toolbox-rules'
import type {
  Member,
  Post,
  ToolboxCompatVote,
  ToolboxEntry,
  ToolboxEnvironment,
  ToolboxMention,
  ToolboxReview,
} from '@/lib/supabase/types'
import { sb, useMockData } from './client'
import type { ToolboxEntryDetails } from './types'
import { msg } from '@/i18n/translate'

export type { ToolboxEntryDetails } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CreateToolboxInput = {
  name: string
  one_liner: string
  description?: string
  type?: ToolboxEntry['type']
  tags?: string[]
  canonical_url: string
  github_url?: string | null
  homepage_url?: string | null
  license?: string | null
}

export async function listToolbox(opts?: {
  type?: string
  tag?: string
  q?: string
  sort?: ToolboxSort
}): Promise<ToolboxEntry[]> {
  if (useMockData()) return mockList(opts)

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
  if (useMockData()) return mockFeatured(limit)
  const list = await listToolbox({ sort: 'trending' })
  return list.filter((e) => e.featured).slice(0, limit)
}

/** Old gallery slug → current slug (0035 toolbox_slug_redirects), or null. */
export async function galleryRedirectSlug(oldSlug: string): Promise<string | null> {
  if (useMockData() || UUID_RE.test(oldSlug)) return null
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
  if (useMockData()) return mockGetEntry(idOrSlug)

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

export async function createToolboxEntry(
  member: Member,
  data: CreateToolboxInput
): Promise<{ entry: ToolboxEntryDetails; created: boolean }> {
  const url = canonicalUrl(data.canonical_url)
  const repo = extractGithubOwnerRepo(url)
  const type = data.type || inferToolboxType(url, data.name)
  const slug =
    (repo ? `${repo.owner}-${repo.repo}` : data.name)
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/gi, '-')
      .replace(/^-|-$/g, '') || `tool-${Date.now()}`

  if (useMockData()) {
    const result = upsertByCanonicalUrl(MUTABLE_TOOLBOX, {
      slug,
      name: data.name,
      one_liner: data.one_liner,
      description: data.description || data.one_liner,
      type,
      tags: data.tags || [],
      canonical_url: url,
      github_url: data.github_url ?? (repo ? url : null),
      homepage_url: data.homepage_url ?? null,
      license: data.license ?? null,
      last_commit_at: null,
      source_repo: repo ? `${repo.owner}/${repo.repo}` : null,
      icon_url: null,
      mention_count: 0,
      install_count: 0,
      avg_rating: 0,
      rating_count: 0,
      featured: false,
      created_by_id: member.id,
      install_snippets: {},
    })
    MUTABLE_TOOLBOX.splice(0, MUTABLE_TOOLBOX.length, ...result.entries)
    return {
      entry: mockGetEntry(result.entry.id)!,
      created: result.created,
    }
  }

  const supabase = await sb()

  const { data: existing } = await supabase
    .from('toolbox_entries')
    .select('*')
    .eq('canonical_url', url)
    .maybeSingle()

  if (existing) {
    return { entry: (await getToolboxEntry((existing as ToolboxEntry).id))!, created: false }
  }

  const { data: inserted, error } = await supabase
    .from('toolbox_entries')
    .insert({
      slug,
      name: data.name,
      one_liner: data.one_liner,
      description: data.description || data.one_liner,
      type,
      tags: data.tags || [],
      canonical_url: url,
      github_url: data.github_url ?? (repo ? url : null),
      homepage_url: data.homepage_url ?? null,
      license: data.license ?? null,
      source_repo: repo ? `${repo.owner}/${repo.repo}` : null,
      install_snippets: {}, // unverified until a reviewer confirms (0033)
      created_by_id: member.id,
    })
    .select('*')
    .single()
  if (error) throw error
  return { entry: (await getToolboxEntry((inserted as ToolboxEntry).id))!, created: true }
}

export async function recordToolboxInstall(
  idOrSlug: string
): Promise<ToolboxEntryDetails> {
  if (useMockData()) {
    const entry = MUTABLE_TOOLBOX.find((e) => e.id === idOrSlug || e.slug === idOrSlug)
    if (!entry) throw new Error(msg('항목을 찾을 수 없습니다.'))
    entry.install_count += 1
    entry.updated_at = new Date().toISOString()
    return mockGetEntry(entry.id)!
  }

  const current = await getToolboxEntry(idOrSlug)
  if (!current) throw new Error(msg('항목을 찾을 수 없습니다.'))
  const supabase = await sb()
  const { error } = await supabase
    .from('toolbox_entries')
    .update({
      install_count: current.install_count + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', current.id)
  if (error) throw error
  return (await getToolboxEntry(current.id))!
}

export async function upsertToolboxReview(
  entryId: string,
  memberId: string,
  rating: number,
  body: string
): Promise<ToolboxEntryDetails> {
  if (useMockData()) {
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

  const { data: reviews } = await supabase
    .from('toolbox_reviews')
    .select('*')
    .eq('entry_id', current.id)
  const ratingInfo = recomputeRating((reviews || []) as ToolboxReview[], current.id)
  await supabase
    .from('toolbox_entries')
    .update({ avg_rating: ratingInfo.avg, rating_count: ratingInfo.count })
    .eq('id', current.id)

  return (await getToolboxEntry(current.id))!
}

export async function voteToolboxCompat(
  entryId: string,
  memberId: string,
  environment: ToolboxEnvironment,
  works: boolean
): Promise<ToolboxEntryDetails> {
  if (useMockData()) {
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
  if (useMockData()) {
    mockAggregate(posts as Parameters<typeof mockAggregate>[0])
    return
  }

  const { isToolishUrl } = await import('@/lib/toolbox-rules')
  const supabase = await sb()

  for (const post of posts) {
    if (!post.url || !isToolishUrl(post.url)) continue
    const key = canonicalUrl(post.url)

    let { data: found } = await supabase
      .from('toolbox_entries')
      .select('*')
      .eq('canonical_url', key)
      .maybeSingle()

    if (!found) {
      const name = post.link_title || key
      const slug =
        key.split('/').filter(Boolean).slice(-2).join('-') || `auto-${post.id}`
      const { data: inserted, error } = await supabase
        .from('toolbox_entries')
        .insert({
          slug,
          name,
          one_liner: post.link_description || `${name} — 커뮤니티에서 언급됨`,
          description: post.link_description || '',
          type: 'mcp_server',
          tags: ['커뮤니티언급'],
          canonical_url: key,
          github_url: key.includes('github.com') ? key : null,
          icon_url: post.link_favicon,
          install_snippets: {},
        })
        .select('*')
        .single()
      if (error && error.code !== '23505') throw error
      found = inserted || found
      if (!found) {
        const again = await supabase
          .from('toolbox_entries')
          .select('*')
          .eq('canonical_url', key)
          .maybeSingle()
        found = again.data
      }
    }
    if (!found) continue

    const entry = found as ToolboxEntry
    await supabase.from('toolbox_mentions').upsert(
      {
        entry_id: entry.id,
        post_id: post.id,
        url: key,
      },
      { onConflict: 'entry_id,post_id,url', ignoreDuplicates: true }
    )

    const { count } = await supabase
      .from('toolbox_mentions')
      .select('id', { count: 'exact', head: true })
      .eq('entry_id', entry.id)
    await supabase
      .from('toolbox_entries')
      .update({ mention_count: count ?? entry.mention_count })
      .eq('id', entry.id)
  }

  // silence unused in mock-only path helpers
  void recordMention
}
