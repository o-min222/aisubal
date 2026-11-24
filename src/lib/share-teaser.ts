import { msg } from '@/i18n/translate'

/**
 * AI-8 follow-up (Colin, t294u): a shared post link's preview teases the post so people get curious.
 * post_share_teaser() (0121) decides eligibility with the A64 landing-peek rules and sanitizes with
 * its peek__line (links/@mentions stripped, ≤ 60 chars): never an author, image, link or anything PII-like.
 */
export type ShareTeaser = { title: string | null; body: string | null }

export const TEASER_MAX = 60
/** set by the middleware on a bot rewrite; selects which shared post's preview to render (same as ?next=) */
export const SHARE_PATH_HEADER = 'x-aisubal-share-path'
export const TEASER_HOOK = msg('이어서 보려면 AI쓰발에서')

/** Link-preview scrapers (no session, no JS). In-app browsers used by people (KAKAOTALK, Line) are not here. */
export const LINK_PREVIEW_BOT_RE = /kakaotalk-scrap|facebookexternalhit|facebookcatalog|Twitterbot|Slackbot|Discordbot|TelegramBot|LinkedInBot|WhatsApp|SkypeUriPreview|Iframely|Embedly|redditbot|vkShare|bitlybot/i
export const isLinkPreviewBot = (ua: string | null | undefined) => !!ua && LINK_PREVIEW_BOT_RE.test(ua)

/** the post id in a shared /posts/{uuid} path (agora and anon lounge posts never get a teaser) */
export function sharedPostId(path: string | null | undefined): string | null {
  const m = /^\/posts\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:[/?#]|$)/i.exec(path ?? '')
  return m ? m[1].toLowerCase() : null
}

/** one line, ≤ TEASER_MAX chars, without a trailing ellipsis (defense in depth: the RPC already cut it) */
export function clipLine(v: unknown): string | null {
  if (typeof v !== 'string') return null
  let s = v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (s.length > TEASER_MAX) s = s.slice(0, TEASER_MAX - 1)
  s = s.replace(/[\s.…]+$/u, '')
  return s.length >= 4 ? s : null
}

export function parseTeaser(v: unknown): ShareTeaser | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const o = v as Record<string, unknown>
  const title = clipLine(o.title), body = clipLine(o.body)
  return title || body ? { title, body } : null
}

/**
 * og:title / og:description for an eligible post: the title (if it has one and there's a body line to
 * tease) as og:title; the body's first line (or the title) cut with an ellipsis, then the hook.
 */
export function teaserMeta(teaser: ShareTeaser, hook: string): { title: string | null; description: string } {
  const line = teaser.body ?? teaser.title!
  return { title: teaser.body && teaser.title ? teaser.title : null, description: `${line}… ${hook}` }
}
