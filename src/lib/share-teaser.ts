import { msg } from '@/i18n/translate'
import { safeNextPath } from '@/lib/handoff-rules'
import { SITE_ORIGIN } from '@/lib/invite-share'
import { OG_DEFAULT } from '@/lib/og'
import type { Metadata } from 'next'

/**
 * A101: a shared link's preview teases an eligible 전체-회원 real-name post with the service name
 * 'AI쓰발' and the first ~100 characters only — never the author's name, nickname, handle or avatar.
 * post_share_preview() (0132) decides eligibility with the A64 landing-peek rules (plus posts that
 * have an image — the card never uses the photo) and sanitizes title/body (links/@mentions stripped).
 * friends/followers/private/group/부캐 posts return null and keep the generic site card.
 * Admin kill switch: site_config.share_preview (default on), separate from landing_peek.
 */
export type ShareTeaser = { title: string | null; body: string | null }

export const TEASER_MAX = 100
export const SHARE_OG_TITLE = 'AI쓰발'
export const SHARE_TEASER_TAG = 'share-teaser'
/** set by the middleware on a bot rewrite; selects which shared path's preview to render (same as ?next=) */
export const SHARE_PATH_HEADER = 'x-aisubal-share-path'
export const TEASER_HOOK = msg('이어서 보려면 AI쓰발에서')

/**
 * Link-preview scrapers (no session, no JS). In-app browsers used by people (KAKAOTALK, Line) are
 * not here — those still 307 to /?next= so sign-in can return to the post.
 */
const LINK_PREVIEW_BOT_RE = /kakaotalk-scrap|facebookexternalhit|facebookcatalog|Facebot|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|WhatsApp|SkypeUriPreview|Iframely|Embedly|redditbot|vkShare|bitlybot|Applebot|MicrosoftPreview|BingPreview|Googlebot|Google-InspectionTool|meta-externalagent|meta-externalfetcher|NotionBot|Pinterestbot|Snapchat|Yandex(?:Bot|Images)|DuckDuckBot|Baiduspider|Yeti|Naverbot|ia_archiver/i
export const isLinkPreviewBot = (ua: string | null | undefined) => !!ua && LINK_PREVIEW_BOT_RE.test(ua)

const CURL_RE = /(?:^| )(?:curl|wget|httpie|Go-http-client|python-requests|python-httpx|libwww-perl|Java\/|okhttp|node-fetch|undici|axios\/|PostmanRuntime|Insomnia)\b/i

/**
 * True for a request that should get OG tags at the shared URL (rewrite, 200) instead of a 307
 * login redirect. People navigating in a browser still redirect so ?next= stays in the address bar.
 */
export function isSharePreviewFetch(input: {
  ua?: string | null
  secFetchMode?: string | null
  secFetchDest?: string | null
}): boolean {
  if (isLinkPreviewBot(input.ua)) return true
  if (input.secFetchMode === 'navigate' || input.secFetchDest === 'document') return false
  const ua = (input.ua ?? '').trim()
  if (!ua) return true
  return !input.secFetchMode && !input.secFetchDest && CURL_RE.test(ua)
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** the post id in a shared /posts/{uuid} path (agora and anon lounge posts never get a teaser) */
export function sharedPostId(path: string | null | undefined): string | null {
  const m = new RegExp(`^/posts/(${UUID})(?:[/?#]|$)`, 'i').exec(path ?? '')
  return m ? m[1].toLowerCase() : null
}

type SharePreviewKind = 'post' | 'agora' | 'anon' | 'profile' | 'gallery' | 'article'

/** Paths whose unauthenticated crawler visit should 200 with OG at the original URL. */
export function sharePreviewKind(next: string | null | undefined): SharePreviewKind | null {
  const raw = (safeNextPath(next) ?? '').split('#')[0].split('?')[0]
  const post = /^\/(posts|agora|anon)\/[0-9a-f-]{8,}(?:\/|$)/i.exec(raw)
  if (post) return post[1] === 'posts' ? 'post' : (post[1] as 'agora' | 'anon')
  if (new RegExp(`^/members/${UUID}$`, 'i').test(raw)) return 'profile'
  if (/^\/u\/[A-Za-z0-9_.가-힣-]{1,32}$/.test(raw)) return 'profile'
  if (/^\/gallery\/(?!new$|submissions$)[^/]+$/.test(raw)) return 'gallery'
  if (/^\/articles\/(?!new$|mine$|series\/)[^/]+$/.test(raw)) return 'article'
  return null
}

/** Absolute canonical URL for og:url (path only, no query or hash). */
export function shareCanonicalUrl(path: string | null | undefined): string {
  const p = (path ?? '/').split('#')[0].split('?')[0] || '/'
  return `${SITE_ORIGIN}${p.startsWith('/') ? p : `/${p}`}`
}

/** one line, ≤ TEASER_MAX chars, without a trailing ellipsis (defense in depth: the RPC already cut it) */
export function clipLine(v: unknown, max = TEASER_MAX): string | null {
  if (typeof v !== 'string') return null
  let s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.length > max) s = s.slice(0, max - 1)
  s = s.replace(/[\s.…]+$/u, '')
  return s.length >= 4 ? s : null
}

export function parseTeaser(v: unknown): ShareTeaser | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const title = clipLine(o.title), body = clipLine(o.body)
  // A101: ignore a leftover `name` from 0131 if a cached or mid-deploy payload still has one
  return title || body ? { title, body } : null
}

/**
 * og:title is always the service name; og:description is the teaser line plus the hook.
 * Never includes an author name, nickname, handle or avatar.
 */
export function teaserMeta(teaser: ShareTeaser, hook: string): { title: string; description: string } {
  const line = teaser.body ?? teaser.title!
  return { title: SHARE_OG_TITLE, description: `${line}… ${hook}` }
}

/** Consistent OG + Twitter tags, including the absolute og:url scrapers need to attach a card. */
export function shareMeta(opts: {
  title: string
  description: string
  url: string
  image?: { url: string; width: number; height: number; alt: string }
}): Pick<Metadata, 'openGraph' | 'twitter'> {
  const image = { ...(opts.image ?? OG_DEFAULT), type: 'image/png' as const }
  return {
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.url,
      siteName: 'AI쓰발',
      type: 'website',
      images: [image],
    },
    twitter: { card: 'summary_large_image', title: opts.title, description: opts.description, images: [image.url] },
  }
}

export function postOgPath(id: string): string {
  return `/og/post/${id}`
}
