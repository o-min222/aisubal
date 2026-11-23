import type { LinkPreview } from '@/lib/supabase/types'
import { safeFetchText, BLOCKED_FETCH_ERRORS, BlockedUrlError } from '@/lib/safe-fetch'
import { resolvePageIcon } from '@/lib/service-icon'
import { socialKind } from '@/lib/link-embed'
import { sb, isMock } from '@/lib/data/client'
import {
  absoluteUrl,
  detectLinkType,
  getMeta,
  getYoutubeId,
  githubOgImage,
  knownSiteIcon,
  MAX_LINK_PREVIEWS,
  sanitizePreview,
  tweetTextFromOembed,
  youtubeThumbnail,
} from '@/lib/link-preview'

/*
 * Server-only link previews. Every network call goes through safeFetchText
 * (public hosts only, DNS answers + every redirect hop checked, size/time caps),
 * so a pasted URL can never make the server reach a private address.
 *
 * Results are cached per server instance (LRU-ish Map, 6h; failures 10 min) so
 * the composer's debounced lookups and repeated renders don't refetch.
 */

/** posts.link_type CHECK (0001) */
const LINK_TYPES = ['article', 'youtube', 'x', 'github', 'other'] as const

const TTL_OK = 6 * 3600_000
const TTL_FAIL = 10 * 60_000
const MAX_ENTRIES = 500

type Entry = { at: number; ttl: number; value: LinkPreview }
const g = globalThis as unknown as { __aisubalPreviewCache?: Map<string, Entry>; __aisubalPreviewInflight?: Map<string, Promise<LinkPreview>> }
const cache = (g.__aisubalPreviewCache ??= new Map())
const inflight = (g.__aisubalPreviewInflight ??= new Map())

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'link'
  }
}

function fallback(url: string): LinkPreview {
  const host = hostOf(url)
  const type = detectLinkType(url)
  return {
    url,
    title: host,
    description: null,
    image: type === 'youtube' ? youtubeThumbnail(url) : type === 'github' ? githubOgImage(url) : null,
    site_name: type === 'x' ? 'X' : type === 'github' ? 'GitHub' : type === 'youtube' ? 'YouTube' : host,
    favicon: knownSiteIcon(url),
    link_type: type,
  }
}

async function oembedJson(endpoint: string): Promise<Record<string, unknown> | null> {
  const res = await safeFetchText(endpoint, 'application/json')
  if (!res.ok || res.status >= 400 || !res.text) return null
  try {
    return JSON.parse(res.text) as Record<string, unknown>
  } catch {
    return null
  }
}
const str = (v: unknown) => (typeof v === 'string' ? v : null)

async function youtubePreview(url: string): Promise<LinkPreview> {
  const id = getYoutubeId(url)
  const o = await oembedJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`)
  return {
    url,
    title: str(o?.title) || 'YouTube 영상',
    description: str(o?.author_name) ? `${o!.author_name} · YouTube` : null,
    image: id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : str(o?.thumbnail_url),
    site_name: 'YouTube',
    favicon: knownSiteIcon(url),
    link_type: 'youtube',
  }
}

async function xPreview(url: string): Promise<LinkPreview> {
  // publish.twitter.com oEmbed works without a key; x.com pages are JS-only.
  const canonical = url.replace(/^https?:\/\/(www\.|mobile\.)?(x|twitter)\.com/i, 'https://twitter.com')
  const o = await oembedJson(`https://publish.twitter.com/oembed?omit_script=1&dnt=1&url=${encodeURIComponent(canonical)}`)
  const author = str(o?.author_name)
  const text = str(o?.html) ? tweetTextFromOembed(String(o!.html)) : null
  if (!o) return fallback(url)
  return {
    url,
    title: author ? `${author} (X)` : 'X 게시물',
    description: text,
    image: null,
    site_name: 'X',
    favicon: knownSiteIcon(url),
    link_type: 'x',
  }
}

/** A58: Vimeo and TikTok publish keyless oEmbed; Instagram's needs an app token, so it uses the page's OG tags */
async function socialPreview(url: string, kind: 'vimeo' | 'tiktok'): Promise<LinkPreview> {
  const endpoint = kind === 'vimeo'
    ? `https://vimeo.com/api/oembed.json?dnt=true&url=${encodeURIComponent(url)}`
    : `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
  const o = await oembedJson(endpoint)
  if (!o) return { ...fallback(url), site_name: kind === 'vimeo' ? 'Vimeo' : 'TikTok' }
  const author = str(o.author_name)
  return {
    url,
    title: str(o.title) || (kind === 'vimeo' ? 'Vimeo' : 'TikTok'),
    description: author ? `${author} · ${kind === 'vimeo' ? 'Vimeo' : 'TikTok'}` : null,
    image: str(o.thumbnail_url),
    site_name: kind === 'vimeo' ? 'Vimeo' : 'TikTok',
    favicon: knownSiteIcon(url),
    link_type: 'other',
  }
}

async function htmlPreview(url: string): Promise<LinkPreview> {
  const type = detectLinkType(url)
  const res = await safeFetchText(url, 'text/html')
  if (!res.ok && BLOCKED_FETCH_ERRORS.has(res.error)) throw new BlockedUrlError(res.error)
  if (!res.ok || res.status >= 400) return fallback(url)
  const html = res.text.slice(0, 300_000)
  const base = res.finalUrl || url
  const title = getMeta(html, 'og:title') || getMeta(html, 'twitter:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || null
  const description = getMeta(html, 'og:description') || getMeta(html, 'twitter:description') || getMeta(html, 'description')
  const image = absoluteUrl(base, getMeta(html, 'og:image') || getMeta(html, 'twitter:image'))
  // the site's real icon, checked through the SSRF-safe fetch; a known host's icon if none checks out
  const favicon = (await resolvePageIcon(html, base).catch(() => null)) || knownSiteIcon(base) || knownSiteIcon(url)
  return {
    url,
    title: title || hostOf(url),
    description,
    image: image || (type === 'github' ? githubOgImage(url) : null),
    site_name: getMeta(html, 'og:site_name') || (type === 'github' ? 'GitHub' : hostOf(url)),
    favicon,
    link_type: type,
  }
}

async function load(url: string): Promise<{ value: LinkPreview; ok: boolean }> {
  const type = detectLinkType(url)
  try {
    const social = socialKind(url)
    const v =
      type === 'youtube' ? await youtubePreview(url)
      : type === 'x' ? await xPreview(url)
      : social === 'vimeo' || social === 'tiktok' ? await socialPreview(url, social)
      : await htmlPreview(url)
    if (social === 'instagram') v.site_name = 'Instagram'
    return { value: sanitizePreview(v), ok: v.title !== hostOf(url) || Boolean(v.image) }
  } catch (e) {
    if (e instanceof BlockedUrlError) throw e // never cache or soften an SSRF block
    return { value: sanitizePreview(fallback(url)), ok: false }
  }
}

/*
 * A58: shared TTL cache (0109) between the memory cache and the network, so instances and deploys
 * reuse each other's cards. Best effort both ways: a cache error never blocks a preview.
 */
async function dbGet(url: string): Promise<LinkPreview | null> {
  if (isMock()) return null
  try {
    const supabase = await sb()
    const { data } = await supabase.rpc('link_preview_cache_get', { p_url: url })
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    // a cached row was written by some member's request: re-check every field before trusting it
    const d = data as Record<string, unknown>
    const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : null)
    const t = s('link_type')
    return sanitizePreview({
      url,
      title: s('title'),
      description: s('description'),
      image: s('image'),
      site_name: s('site_name'),
      favicon: s('favicon'),
      link_type: (LINK_TYPES as readonly string[]).includes(t ?? '') ? (t as LinkPreview['link_type']) : detectLinkType(url),
    })
  } catch {
    return null
  }
}

async function dbPut(url: string, value: LinkPreview, ok: boolean): Promise<void> {
  if (isMock()) return
  try {
    const supabase = await sb()
    await supabase.rpc('link_preview_cache_put', { p_url: url, p_value: value, p_ok: ok })
  } catch {
    /* cache only */
  }
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const now = Date.now()
  const hit = cache.get(url)
  if (hit && now - hit.at < hit.ttl) {
    cache.delete(url)
    cache.set(url, hit) // refresh LRU position
    return hit.value
  }
  const pending = inflight.get(url)
  if (pending) return pending
  const p = (async () => {
    const shared = await dbGet(url)
    if (shared) return { value: shared, ok: true, fromDb: true }
    return { ...(await load(url)), fromDb: false }
  })()
    .then(({ value, ok, fromDb }) => {
      if (!fromDb) void dbPut(url, value, ok)
      cache.set(url, { at: Date.now(), ttl: ok ? TTL_OK : TTL_FAIL, value })
      while (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
      return value
    })
    .finally(() => inflight.delete(url))
  inflight.set(url, p)
  return p
}

/** Up to 4 previews in parallel, same order as given. */
export async function fetchLinkPreviews(urls: string[]): Promise<LinkPreview[]> {
  // a blocked link may still be posted; it just gets the host-only card
  return Promise.all(
    urls.slice(0, MAX_LINK_PREVIEWS).map((u) =>
      fetchLinkPreview(u).catch((e) => {
        if (e instanceof BlockedUrlError) return sanitizePreview(fallback(u))
        throw e
      })
    )
  )
}
