import { msg } from '@/i18n/translate'

/** A108: Brunch-style articles. Pure helpers — the database is the source of truth for truncation. */

export const ARTICLE_BODY_MAX = 100_000
export const ARTICLE_TITLE_MAX = 120
export const ARTICLE_SUBTITLE_MAX = 200
export const ARTICLE_SERIES_TITLE_MAX = 120
export const ARTICLE_SERIES_DESC_MAX = 2_000
export const ARTICLE_COMMENT_MAX = 2_000
export const ARTICLE_TEASER_MAX = 800
export const ARTICLE_OG_TEASER_MAX = 100
export const ARTICLE_CHARS_PER_MIN = 500
export const ARTICLE_PUBLISH_LIMIT_PER_DAY = 5
export const ARTICLE_SLUG_MAX = 60

export const ARTICLE_RESERVED_SLUGS = ['new', 'mine', 'series', 'edit'] as const

export const ARTICLE_STATUSES = ['draft', 'published', 'hidden'] as const
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number]

export const ARTICLE_SERIES_STATUSES = ['draft', 'published', 'completed'] as const
export type ArticleSeriesStatus = (typeof ARTICLE_SERIES_STATUSES)[number]

export const ARTICLE_IMAGE_MAX_BYTES = 4 * 1024 * 1024
export const ARTICLE_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** A136: the member's reusable image library (covers, thumbnails). Must match article__library_cap() in 0153. */
export const ARTICLE_LIBRARY_CAP = 100
export const ARTICLE_IMAGE_KINDS = ['cover', 'thumbnail', 'inline'] as const
export type ArticleImageKind = (typeof ARTICLE_IMAGE_KINDS)[number]
/** What an agent upload is stored as (re-encoded; matches the 2 MB check on article_image_blobs.bytes). */
export const ARTICLE_AGENT_IMAGE_OUT_MAX = 1_500_000
export const ARTICLE_AGENT_IMAGE_MAX_SIDE = 2000
export const ARTICLE_AGENT_IMAGES_PER_DAY = 30

/** Browse tabs on /articles */
export const ARTICLE_BROWSE_TABS = [
  { id: 'latest', label: msg('최신') },
  { id: 'series', label: msg('연재') },
  { id: 'subscribed', label: msg('구독 중') },
] as const
export type ArticleBrowseTab = (typeof ARTICLE_BROWSE_TABS)[number]['id']

export function parseArticleBrowseTab(v: string | string[] | null | undefined): ArticleBrowseTab {
  const s = Array.isArray(v) ? v[0] : v
  return (ARTICLE_BROWSE_TABS.find((t) => t.id === s)?.id ?? 'latest') as ArticleBrowseTab
}

/**
 * Signed-out visitors may open `/articles/{slug}` (the reading view). Browse, editor,
 * series, and edit stay members-only.
 */
export function isPublicArticlePath(pathname: string | null | undefined): boolean {
  const raw = (pathname ?? '').split('#')[0].split('?')[0]
  const m = /^\/articles\/([^/]+)\/?$/.exec(raw)
  if (!m) return false
  return !(ARTICLE_RESERVED_SLUGS as readonly string[]).includes(m[1])
}

export function articleHref(slug: string): string {
  return `/articles/${slug}`
}

export function articleSeriesHref(slug: string): string {
  return `/articles/series/${slug}`
}

/** Edit lives at `/articles/{slug}/edit`. A leftover `/articles/{id}/edit` still resolves and redirects. */
export function articleEditHref(slug: string): string {
  return `/articles/${slug}/edit`
}

/** Markdown-ish body → plain text for reading time (headings/emphasis/links stripped, lightly). */
export function articlePlainText(body: string | null | undefined): string {
  let s = body ?? ''
  s = s.replace(/```[\s\S]*?```/g, ' ')
  s = s.replace(/`[^`]*`/g, ' ')
  s = s.replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
  s = s.replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
  s = s.replace(/^#{1,6}\s+/gm, '')
  s = s.replace(/^\s{0,3}>\s?/gm, '')
  s = s.replace(/^\s*[-*+]\s+/gm, '')
  s = s.replace(/^\s*\d+\.\s+/gm, '')
  s = s.replace(/[*_~]+/g, '')
  s = s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]+/g, ' ')
  return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim()
}

/** Stored reading_sec: ~500 Korean characters per minute, at least 1 when there is text. */
export function articleReadingSec(body: string | null | undefined): number {
  const n = articlePlainText(body).length
  if (n <= 0) return 0
  return Math.max(1, Math.ceil(n / ARTICLE_CHARS_PER_MIN) * 60)
}

export function formatReadingTime(sec: number, t: (s: string, vars?: Record<string, string | number>) => string): string {
  const min = Math.max(1, Math.round(sec / 60) || 1)
  return t('약 {n}분', { n: min })
}

/**
 * Server-side reading teaser: first `max` characters of the markdown, broken at a
 * paragraph or sentence when possible. Never returns the rest of the body.
 */
export function articleTeaserBody(body: string | null | undefined, max = ARTICLE_TEASER_MAX): string {
  const raw = (body ?? '').replace(/\r\n/g, '\n').trim()
  if (!raw) return ''
  if (raw.length <= max) return raw
  const slice = raw.slice(0, max)
  const para = slice.lastIndexOf('\n\n')
  const nl = slice.lastIndexOf('\n')
  const sentence = Math.max(slice.lastIndexOf('。'), slice.lastIndexOf('. '), slice.lastIndexOf('? '), slice.lastIndexOf('! '), slice.lastIndexOf('다. '))
  let cut = slice.length
  if (para >= Math.floor(max * 0.45)) cut = para
  else if (sentence >= Math.floor(max * 0.45)) cut = sentence + (slice[sentence] === '다' ? 2 : 1)
  else if (nl >= Math.floor(max * 0.45)) cut = nl
  return slice.slice(0, cut).replace(/[\s.#*_>-]+$/u, '').trim()
}

/** OG / share line, ≤ 100 characters, no trailing ellipsis. */
export function articleOgTeaser(opts: { body?: string | null; subtitle?: string | null; title?: string | null }, max = ARTICLE_OG_TEASER_MAX): string | null {
  const plain = articlePlainText(opts.body) || (opts.subtitle ?? '').trim() || (opts.title ?? '').trim()
  if (!plain) return null
  let s = plain.replace(/\s+/g, ' ').trim()
  if (s.length > max) s = s.slice(0, max - 1)
  s = s.replace(/[\s.…]+$/u, '')
  return s.length >= 4 ? s : null
}

/** Title-based slug: latin/digits only. Korean-only titles return '' so the caller suffixes an id. */
export function articleSlugBase(title: string | null | undefined): string {
  const s = (title ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ARTICLE_SLUG_MAX)
  return s
}

export function isReservedArticleSlug(slug: string): boolean {
  return (ARTICLE_RESERVED_SLUGS as readonly string[]).includes(slug)
}

/** Strip links and @mentions from a share line (same idea as post_share_preview). */
export function sanitizeArticleShareLine(v: string | null | undefined): string {
  let l = v ?? ''
  l = l.replace(/(https?:\/\/|www\.)\S+/gi, '')
  l = l.replace(/@[A-Za-z0-9_.가-힣-]+/g, '')
  return l.replace(/\s+/g, ' ').trim()
}

export function canPublishArticle(member: { is_admin?: boolean; article_writer?: boolean; article_can_publish?: boolean } | null | undefined): boolean {
  if (!member) return false
  if (typeof member.article_can_publish === 'boolean') return member.article_can_publish
  return Boolean(member.is_admin || member.article_writer)
}

/** App-route URL for a private cover or inline image. The API signs the object. */
export function articleImageSrc(path: string | null | undefined): string | null {
  if (!path) return null
  return `/api/article-image?p=${encodeURIComponent(path)}`
}

/** Browser tab title. Root layout uses a template without %s, so this must be absolute. */
export function articleDocumentTitle(title: string | null | undefined): { absolute: string } {
  const t = (title ?? '').trim() || '아티클'
  return { absolute: `${t} · AI쓰발` }
}

/**
 * A135: where the reader's '< 목록' goes. A same-origin referrer means the reader came from inside
 * the app (feed, list, series, search), so history back keeps their place. Anything else (a shared
 * link, a search engine, no referrer) falls back to /articles. The editor and 새 아티클 pages are
 * skipped so back never lands on a half-written draft after 발행.
 */
export function articleBackMode(referrer: string | null | undefined, origin: string): 'back' | 'list' {
  if (!referrer) return 'list'
  let u: URL
  try { u = new URL(referrer) } catch { return 'list' }
  if (u.origin !== origin) return 'list'
  if (u.pathname === '/articles/new' || /^\/articles\/[^/]+\/edit\/?$/.test(u.pathname)) return 'list'
  return 'back'
}

/** A136: the first inline body image, the same rule article__first_image() applies in the database. */
export function firstInlineImagePath(body: string | null | undefined): string | null {
  const m = /\/api\/article-image\?p=([^)\s"']+)/.exec(body ?? '')
  if (!m) return null
  const p = m[1]!.replace(/%2f/gi, '/')
  return p || null
}

type ImagePaths = { coverPath?: string | null; thumbnailPath?: string | null; firstImagePath?: string | null }

/**
 * A136: which image a CARD (list, feed, profile) shows: the separate thumbnail, else the cover,
 * else the first inline body image. null = the letter tile.
 */
export function articleCardImagePath(a: ImagePaths): string | null {
  return a.thumbnailPath || a.coverPath || a.firstImagePath || null
}

/**
 * A136: which image the share card (OG, 1200x630) shows: the cover, else the thumbnail, else the first
 * inline body image. null = the text-only default card. The wide cover is the better crop for a share card.
 */
export function articleShareImagePath(a: ImagePaths): string | null {
  return articleShareImagePaths(a)[0] ?? null
}

/** The same order as a list, so the OG route can fall through to the next image when a viewer may not read one. */
export function articleShareImagePaths(a: ImagePaths): string[] {
  return [a.coverPath, a.thumbnailPath, a.firstImagePath].filter((p, i, all): p is string => Boolean(p) && all.indexOf(p) === i)
}
