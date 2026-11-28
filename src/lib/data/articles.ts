import { cache } from 'react'
import { createAnonClient } from '@/lib/supabase/anon'
import { articleTeaserBody, canPublishArticle } from '@/lib/article-rules'
import { MOCK_MEMBERS } from '@/lib/mock-data'
import { sb, isMock } from './client'

export class ArticleError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'ArticleError'
  }
}

export type ArticleAuthor = { id: string; name: string; handle: string | null; avatarUrl: string | null }
/** Present when an agent wrote the article on the owner's behalf. */
export type ArticleAgent = { name: string; handle: string | null }
export type ArticleSeriesBrief = {
  id: string
  slug: string
  title: string
  description: string
  coverPath: string | null
  status: 'draft' | 'published' | 'completed'
  episodeCount: number
  authorId: string
  author?: ArticleAuthor
  subscribed?: boolean
  subscriberCount?: number
  isMine?: boolean
  canonicalSlug?: string
  episodes?: ArticleCard[]
}
export type ArticleCard = {
  id: string
  slug: string
  title: string
  subtitle: string | null
  coverPath: string | null
  status: 'draft' | 'published' | 'hidden'
  publishedAt: string | null
  editedAt: string | null
  createdAt: string
  updatedAt: string
  readingSec: number
  likeCount: number
  commentCount: number
  episodeNo: number | null
  seriesId: string | null
  author: ArticleAuthor
  agent?: ArticleAgent | null
  series: ArticleSeriesBrief | null
  body?: string | null
  isMine?: boolean
  likedByMe?: boolean
  subscribed?: boolean
  truncated?: boolean
  canonicalSlug?: string
  firstPublish?: boolean
}

export type ArticleComment = {
  id: string
  articleId: string
  parentId: string | null
  replyToId: string | null
  body: string | null
  deleted: boolean
  editedAt: string | null
  createdAt: string
  author: ArticleAuthor
  isMine: boolean
}

export type ArticleSharePreview = { title: string | null; body: string | null; coverPath: string | null; slug: string }

const DEV_AUTHOR: ArticleAuthor = { id: 'dev-user-id', name: '개발자', handle: 'dev', avatarUrl: null }
const OTHER = MOCK_MEMBERS[1] || { id: 'member-2', display_name: '프롬프트수집가', handle: 'prompt', avatar_url: null }
const OTHER_AUTHOR: ArticleAuthor = { id: OTHER.id, name: OTHER.display_name ?? '프롬프트수집가', handle: OTHER.handle ?? 'prompt', avatarUrl: OTHER.avatar_url ?? null }

const LONG_BODY = `한 줄짜리 피드와는 다른 호흡으로, 에이전트가 실패하는 이유를 천천히 적어 보려고 합니다.

계획은 짧고, 검증은 잦아야 합니다. 그런데도 우리는 한 번에 큰 일을 시키려다 길을 잃습니다.

이 다음 문단부터는 멤버만 이어 읽을 수 있어요. 도구 호출 실패를 줄이려면 계획 먼저 쓰게 하고, 한 걸음마다 관측 가능한 결과를 남기는 편이 낫습니다.

` + '가'.repeat(900) + `

비밀 본문입니다. 이 문장은 비회원에게 가면 안 됩니다.`

type Mock = {
  series: ArticleSeriesBrief[]
  articles: ArticleCard[]
  subs: Set<string>
  likes: Set<string>
  comments: ArticleComment[]
  writer: Set<string>
  publishing: boolean
  publicTeaser: boolean
  sharePreview: boolean
}
const g = globalThis as unknown as { __aisubalArticles?: Mock }

function seed(): Mock {
  if (g.__aisubalArticles) return g.__aisubalArticles
  const series: ArticleSeriesBrief = {
    id: 'series-1',
    slug: 'agent-notes',
    title: '에이전트 노트',
    description: '현장의 시행착오를 느슨하게 묶어 둡니다.',
    coverPath: null,
    status: 'published',
    episodeCount: 1,
    authorId: OTHER_AUTHOR.id,
    author: OTHER_AUTHOR,
  }
  const published: ArticleCard = {
    id: 'article-1',
    slug: 'why-agents-fail',
    title: '에이전트가 실패하는 이유',
    subtitle: '계획은 짧게, 검증은 자주',
    coverPath: null,
    status: 'published',
    publishedAt: '2026-11-26T03:00:00.000Z',
    editedAt: null,
    createdAt: '2026-11-25T12:00:00.000Z',
    updatedAt: '2026-11-26T03:00:00.000Z',
    readingSec: 180,
    likeCount: 4,
    commentCount: 1,
    episodeNo: 1,
    seriesId: series.id,
    author: OTHER_AUTHOR,
    series,
    body: LONG_BODY,
  }
  const draft: ArticleCard = {
    id: 'article-draft',
    slug: 'article-draftdr',
    title: '아직 안 낸 초고',
    subtitle: null,
    coverPath: null,
    status: 'draft',
    publishedAt: null,
    editedAt: null,
    createdAt: '2026-11-27T01:00:00.000Z',
    updatedAt: '2026-11-27T01:00:00.000Z',
    readingSec: 60,
    likeCount: 0,
    commentCount: 0,
    episodeNo: null,
    seriesId: null,
    author: DEV_AUTHOR,
    series: null,
    body: '초고 본문입니다.',
    isMine: true,
  }
  const comments: ArticleComment[] = [
    {
      id: 'ac-1',
      articleId: published.id,
      parentId: null,
      replyToId: null,
      body: '이 호흡이 맞아요. 피드와 나눠 두길 잘한 것 같아요.',
      deleted: false,
      editedAt: null,
      createdAt: '2026-11-26T04:00:00.000Z',
      author: DEV_AUTHOR,
      isMine: true,
    },
  ]
  g.__aisubalArticles = {
    series: [series],
    articles: [published, draft],
    subs: new Set<string>(),
    likes: new Set<string>(),
    comments,
    writer: new Set(['dev-user-id']),
    publishing: true,
    publicTeaser: true,
    sharePreview: true,
  }
  return g.__aisubalArticles
}

export function mockArticlePublishing(on?: boolean): boolean {
  const st = seed()
  if (on !== undefined) st.publishing = on
  return st.publishing
}
export function mockArticlePublicTeaser(on?: boolean): boolean {
  const st = seed()
  if (on !== undefined) st.publicTeaser = on
  return st.publicTeaser
}
export function mockArticleSharePreview(on?: boolean): boolean {
  const st = seed()
  if (on !== undefined) st.sharePreview = on
  return st.sharePreview
}
export function mockArticleWriter(memberId: string, on?: boolean): boolean {
  const st = seed()
  if (on === true) st.writer.add(memberId)
  if (on === false) st.writer.delete(memberId)
  return st.writer.has(memberId)
}

function rpcError(error: { message?: string } | null | undefined): never {
  throw new ArticleError((error?.message || 'error').replace(/^.*ERROR:\s*/i, '').split('\n')[0]!.trim())
}

function asCard(v: unknown): ArticleCard {
  return v as ArticleCard
}

function mockVisible(a: ArticleCard, viewerId: string | null, isAdmin = viewerId === 'dev-user-id') {
  if (a.status === 'published') return true
  return Boolean(viewerId && (a.author.id === viewerId || isAdmin))
}

export async function getArticle(slug: string, opts: { teaser?: boolean } = {}): Promise<ArticleCard | null> {
  if (isMock()) {
    const st = seed()
    const a = st.articles.find((x) => x.slug === slug)
    if (!a) return null
    if (opts.teaser) {
      if (!st.publicTeaser || a.status !== 'published') return null
      const teaser = articleTeaserBody(a.body ?? '')
      return { ...a, body: teaser, truncated: (a.body ?? '').length > teaser.length, likedByMe: false, isMine: false }
    }
    if (!mockVisible(a, 'dev-user-id')) return null
    return { ...a, isMine: a.author.id === 'dev-user-id', likedByMe: st.likes.has(`dev-user-id:${a.id}`), truncated: false }
  }
  if (opts.teaser) {
    const { data, error } = await createAnonClient().rpc('article_public_teaser', { p_slug: slug })
    if (error) rpcError(error)
    return data ? asCard(data) : null
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_get', { p_slug: slug })
  if (error) rpcError(error)
  return data ? asCard(data) : null
}

export const getArticleCached = cache(getArticle)

export async function getArticleById(id: string): Promise<ArticleCard | null> {
  if (isMock()) {
    const a = seed().articles.find((x) => x.id === id)
    return a && mockVisible(a, 'dev-user-id') ? { ...a, isMine: a.author.id === 'dev-user-id', truncated: false } : null
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_get_id', { p_id: id })
  if (error) rpcError(error)
  return data ? asCard(data) : null
}

export async function getArticleSharePreview(slug: string): Promise<ArticleSharePreview | null> {
  if (isMock()) {
    const st = seed()
    if (!st.sharePreview) return null
    const a = st.articles.find((x) => x.slug === slug && x.status === 'published')
    if (!a) return null
    return { title: a.title, body: a.subtitle || a.title, coverPath: a.coverPath, slug: a.slug }
  }
  const { data, error } = await createAnonClient().rpc('article_share_preview', { p_slug: slug })
  if (error) return null
  return (data as ArticleSharePreview | null) ?? null
}

export async function listArticles(tab: string, page = 1, pageSize = 20): Promise<{ items: unknown[]; total: number; tab: string }> {
  if (isMock()) {
    const st = seed()
    if (tab === 'series') {
      const items = st.series.filter((s) => s.status !== 'draft')
      return { items, total: items.length, tab: 'series' }
    }
    let items = st.articles.filter((a) => a.status === 'published')
    if (tab === 'subscribed') items = items.filter((a) => a.seriesId && st.subs.has(`dev-user-id:${a.seriesId}`))
    return { items, total: items.length, tab }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_list', { p_tab: tab, p_limit: pageSize, p_offset: (page - 1) * pageSize })
  if (error) rpcError(error)
  const row = (data ?? { items: [], total: 0, tab }) as { items: unknown[]; total: number; tab: string }
  return { items: row.items ?? [], total: row.total ?? 0, tab: row.tab ?? tab }
}

export async function listMyArticles(): Promise<{ articles: ArticleCard[]; series: ArticleSeriesBrief[] }> {
  if (isMock()) {
    const st = seed()
    return {
      articles: st.articles.filter((a) => a.author.id === 'dev-user-id'),
      series: st.series.filter((s) => s.authorId === 'dev-user-id'),
    }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_list_mine')
  if (error) rpcError(error)
  const row = (data ?? {}) as { articles?: ArticleCard[]; series?: ArticleSeriesBrief[] }
  return { articles: row.articles ?? [], series: row.series ?? [] }
}

export async function listAuthorArticles(authorId: string): Promise<{ articles: ArticleCard[]; series: ArticleSeriesBrief[] }> {
  if (isMock()) {
    const st = seed()
    return {
      articles: st.articles.filter((a) => a.author.id === authorId && a.status === 'published'),
      series: st.series.filter((s) => s.authorId === authorId && s.status !== 'draft'),
    }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_list_by_author', { p_author: authorId, p_limit: 12 })
  if (error) rpcError(error)
  const row = (data ?? {}) as { articles?: ArticleCard[]; series?: ArticleSeriesBrief[] }
  return { articles: row.articles ?? [], series: row.series ?? [] }
}

export async function searchArticles(q: string, limit = 20): Promise<ArticleCard[]> {
  if (isMock()) {
    const n = q.trim().toLowerCase()
    if (n.length < 2) return []
    return seed().articles.filter((a) => a.status === 'published' && `${a.title} ${a.subtitle ?? ''} ${a.body ?? ''}`.toLowerCase().includes(n))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_search', { p_q: q, p_limit: limit })
  if (error) rpcError(error)
  return (data as ArticleCard[]) ?? []
}

export async function listFeedArticleCards(scope: string, after: string | null, before: string | null): Promise<ArticleCard[]> {
  if (isMock()) {
    return seed().articles.filter((a) => a.status === 'published')
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_feed_cards', {
    p_scope: scope,
    p_after: after,
    p_before: before,
    p_limit: 20,
  })
  if (error) return []
  return (data as ArticleCard[]) ?? []
}

export async function upsertArticle(input: {
  id?: string | null
  title: string
  subtitle?: string | null
  body?: string
  coverPath?: string | null
  seriesId?: string | null
  episodeNo?: number | null
}): Promise<ArticleCard> {
  if (isMock()) {
    const st = seed()
    const existing = input.id ? st.articles.find((a) => a.id === input.id) : undefined
    const row: ArticleCard = {
      id: existing?.id ?? crypto.randomUUID(),
      slug: existing?.slug ?? `article-${crypto.randomUUID().slice(0, 8)}`,
      title: input.title,
      subtitle: input.subtitle ?? null,
      coverPath: input.coverPath ?? null,
      status: existing?.status ?? 'draft',
      publishedAt: existing?.publishedAt ?? null,
      editedAt: existing?.status === 'published' ? new Date().toISOString() : existing?.editedAt ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      readingSec: 60,
      likeCount: existing?.likeCount ?? 0,
      commentCount: existing?.commentCount ?? 0,
      episodeNo: input.episodeNo ?? null,
      seriesId: input.seriesId ?? null,
      author: DEV_AUTHOR,
      series: input.seriesId ? st.series.find((s) => s.id === input.seriesId) ?? null : null,
      body: input.body ?? '',
      isMine: true,
      truncated: false,
    }
    if (existing) st.articles = st.articles.map((a) => (a.id === existing.id ? row : a))
    else st.articles.unshift(row)
    return row
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_upsert', {
    p_id: input.id ?? null,
    p_title: input.title,
    p_subtitle: input.subtitle ?? null,
    p_body: input.body ?? '',
    p_cover_path: input.coverPath ?? null,
    p_series_id: input.seriesId ?? null,
    p_episode_no: input.episodeNo ?? null,
  })
  if (error) rpcError(error)
  return asCard(data)
}

export async function publishArticle(id: string): Promise<ArticleCard> {
  if (isMock()) {
    if (!seed().publishing || !seed().writer.has('dev-user-id')) throw new ArticleError('not_writer')
    const a = seed().articles.find((x) => x.id === id)
    if (!a) throw new ArticleError('not_found')
    a.status = 'published'
    a.publishedAt = a.publishedAt ?? new Date().toISOString()
    a.updatedAt = new Date().toISOString()
    return { ...a, isMine: true, firstPublish: true }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_publish', { p_id: id })
  if (error) rpcError(error)
  return asCard(data)
}

export async function hideArticle(id: string): Promise<ArticleCard> {
  if (isMock()) {
    const a = seed().articles.find((x) => x.id === id)
    if (!a) throw new ArticleError('not_found')
    a.status = 'hidden'
    return { ...a, isMine: true }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_hide', { p_id: id })
  if (error) rpcError(error)
  return asCard(data)
}

export async function deleteArticle(id: string): Promise<{ id: string; deleted: boolean; status?: string }> {
  if (isMock()) {
    const st = seed()
    const a = st.articles.find((x) => x.id === id)
    if (!a) throw new ArticleError('not_found')
    if (a.status === 'published' || (a.status === 'hidden' && a.commentCount > 0)) {
      a.status = 'hidden'
      return { id, deleted: false, status: 'hidden' }
    }
    st.articles = st.articles.filter((x) => x.id !== id)
    return { id, deleted: true }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_delete', { p_id: id })
  if (error) rpcError(error)
  return data as { id: string; deleted: boolean; status?: string }
}

export async function upsertSeries(input: {
  id?: string | null
  title: string
  description?: string
  coverPath?: string | null
  status?: 'draft' | 'published' | 'completed'
}): Promise<ArticleSeriesBrief> {
  if (isMock()) {
    const st = seed()
    const existing = input.id ? st.series.find((s) => s.id === input.id) : undefined
    const row: ArticleSeriesBrief = {
      id: existing?.id ?? crypto.randomUUID(),
      slug: existing?.slug ?? `series-${crypto.randomUUID().slice(0, 8)}`,
      title: input.title,
      description: input.description ?? '',
      coverPath: input.coverPath ?? null,
      status: input.status ?? existing?.status ?? 'draft',
      episodeCount: existing?.episodeCount ?? 0,
      authorId: 'dev-user-id',
      isMine: true,
    }
    if (existing) st.series = st.series.map((s) => (s.id === existing.id ? row : s))
    else st.series.unshift(row)
    return row
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_series_upsert', {
    p_id: input.id ?? null,
    p_title: input.title,
    p_description: input.description ?? '',
    p_cover_path: input.coverPath ?? null,
    p_status: input.status ?? 'draft',
  })
  if (error) rpcError(error)
  return data as ArticleSeriesBrief
}

export async function getSeries(slug: string): Promise<ArticleSeriesBrief | null> {
  if (isMock()) {
    const s = seed().series.find((x) => x.slug === slug)
    if (!s) return null
    const episodes = seed().articles.filter((a) => a.seriesId === s.id && a.status === 'published')
    return { ...s, episodes, subscribed: seed().subs.has(`dev-user-id:${s.id}`), isMine: s.authorId === 'dev-user-id', canonicalSlug: s.slug, subscriberCount: [...seed().subs].filter((x) => x.endsWith(`:${s.id}`)).length }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_series_get', { p_slug: slug })
  if (error) rpcError(error)
  return (data as ArticleSeriesBrief | null) ?? null
}

export async function subscribeSeries(id: string, on: boolean): Promise<{ subscribed: boolean; subscriberCount: number }> {
  if (isMock()) {
    const key = `dev-user-id:${id}`
    if (on) seed().subs.add(key)
    else seed().subs.delete(key)
    return { subscribed: on, subscriberCount: [...seed().subs].filter((x) => x.endsWith(`:${id}`)).length }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_series_subscribe', { p_series: id, p_on: on })
  if (error) rpcError(error)
  return data as { subscribed: boolean; subscriberCount: number }
}

export async function toggleArticleLike(id: string, on: boolean): Promise<{ likedByMe: boolean; likeCount: number }> {
  if (isMock()) {
    const a = seed().articles.find((x) => x.id === id)
    if (!a) throw new ArticleError('not_found')
    if (a.author.id === 'dev-user-id') throw new ArticleError('self_like')
    const key = `dev-user-id:${id}`
    if (on) seed().likes.add(key)
    else seed().likes.delete(key)
    a.likeCount = Math.max(0, a.likeCount + (on ? 1 : -1))
    return { likedByMe: on, likeCount: a.likeCount }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_like_toggle', { p_id: id, p_on: on })
  if (error) rpcError(error)
  return data as { likedByMe: boolean; likeCount: number }
}

export async function listArticleComments(id: string): Promise<ArticleComment[]> {
  if (isMock()) return seed().comments.filter((c) => c.articleId === id)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_comments_list', { p_id: id })
  if (error) rpcError(error)
  return (data as ArticleComment[]) ?? []
}

export async function addArticleComment(id: string, body: string, parentId?: string | null, replyToId?: string | null): Promise<ArticleComment> {
  if (isMock()) {
    const c: ArticleComment = {
      id: crypto.randomUUID(),
      articleId: id,
      parentId: parentId ?? null,
      replyToId: replyToId ?? null,
      body,
      deleted: false,
      editedAt: null,
      createdAt: new Date().toISOString(),
      author: DEV_AUTHOR,
      isMine: true,
    }
    seed().comments.push(c)
    const a = seed().articles.find((x) => x.id === id)
    if (a) a.commentCount += 1
    return c
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_comment_add', { p_id: id, p_body: body, p_parent: parentId ?? null, p_reply_to: replyToId ?? null })
  if (error) rpcError(error)
  return data as ArticleComment
}

export async function deleteArticleComment(id: string): Promise<ArticleComment> {
  if (isMock()) {
    const c = seed().comments.find((x) => x.id === id)
    if (!c) throw new ArticleError('not_found')
    c.deleted = true
    c.body = null
    return c
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('article_comment_delete', { p_id: id })
  if (error) rpcError(error)
  return data as ArticleComment
}

export async function adminSetArticleWriter(memberId: string, on: boolean): Promise<boolean> {
  if (isMock()) return mockArticleWriter(memberId, on)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('admin_set_article_writer', { p_member: memberId, p_on: on })
  if (error) rpcError(error)
  return Boolean((data as { articleWriter?: boolean } | null)?.articleWriter)
}

export { canPublishArticle }
