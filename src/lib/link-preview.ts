import type { LinkType, LinkPreview } from '@/lib/supabase/types'

export function detectLinkType(url: string): LinkType {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (host.includes('youtube.com') || host === 'youtu.be') return 'youtube'
    if (host === 'x.com' || host === 'twitter.com') return 'x'
    if (host === 'github.com') return 'github'
    return 'article'
  } catch {
    return 'other'
  }
}

/**
 * Real icons for hosts people link most, checked to return an image (2026-11-23). Used when a page's
 * own icon can't be read at unfurl time (blocked, rate-limited, JS-only), so GitHub never shows a letter.
 */
const KNOWN_SITE_ICONS: [RegExp, string][] = [
  [/(^|\.)github\.(com|io)$|^gist\.github\.com$/, 'https://github.githubassets.com/apple-touch-icon-180x180.png'],
  [/(^|\.)youtube\.com$|^youtu\.be$/, 'https://www.youtube.com/favicon.ico'],
  [/(^|\.)(x|twitter)\.com$/, 'https://abs.twimg.com/responsive-web/client-web/icon-ios.77d25eba.png'],
  [/(^|\.)npmjs\.(com|org)$/, 'https://static.npmjs.com/58a19602036db1daee0d7863c94673a4.png'],
  [/(^|\.)huggingface\.co$|(^|\.)hf\.co$/, 'https://huggingface.co/favicon.ico'],
  [/(^|\.)notion\.(so|site)$/, 'https://www.notion.so/images/logo-ios.png'],
  [/(^|\.)vercel\.(com|app)$/, 'https://vercel.com/apple-touch-icon.png'],
  [/(^|\.)reddit\.com$/, 'https://www.reddit.com/favicon.ico'],
  [/^news\.ycombinator\.com$/, 'https://news.ycombinator.com/favicon.ico'],
  [/(^|\.)wikipedia\.org$/, 'https://en.wikipedia.org/static/apple-touch/wikipedia.png'],
  [/(^|\.)arxiv\.org$/, 'https://arxiv.org/static/browse/0.3.4/images/icons/apple-touch-icon.png'],
  [/(^|\.)openai\.com$/, 'https://openai.com/apple-icon.png'],
  [/(^|\.)chatgpt\.com$/, 'https://cdn.oaistatic.com/assets/apple-touch-icon-mz9nytnj.webp'],
  [/(^|\.)anthropic\.com$|(^|\.)claude\.ai$/, 'https://www.anthropic.com/favicon.ico'],
]

export function knownSiteIcon(url: string): string | null {
  let host: string
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return null
  }
  return KNOWN_SITE_ICONS.find(([re]) => re.test(host))?.[1] ?? null
}

export function getYoutubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1).split('/')[0] || null
    }
    if (u.hostname.includes('youtube.com')) {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/)
      return u.searchParams.get('v') || m?.[1] || null
    }
  } catch {
    /* ignore */
  }
  return null
}

export function youtubeThumbnail(url: string): string | null {
  const id = getYoutubeId(url)
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null
}

export function youtubeEmbedUrl(url: string): string | null {
  const id = getYoutubeId(url)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

export function getMeta(html: string, property: string): string | null {
  const propRe = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    'i'
  )
  const contentFirst = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
    'i'
  )
  return html.match(propRe)?.[1] || html.match(contentFirst)?.[1] || null
}

export function absoluteUrl(base: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return maybeRelative
  }
}


// ------------------------------------------------------------------ multi-link previews

/** Composer / post carousel cap. */
export const MAX_LINK_PREVIEWS = 4

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`]+/gi

/**
 * http(s) links in typed text, in order, de-duplicated, trailing punctuation and
 * unbalanced closing brackets trimmed (so "(see https://a.com)." → https://a.com).
 */
export function extractUrls(text: string, max = MAX_LINK_PREVIEWS): string[] {
  const out: string[] = []
  for (const m of text.matchAll(URL_IN_TEXT)) {
    let u = m[0].replace(/[.,;:!?…。、]+$/u, '')
    for (const [open, close] of [['(', ')'], ['[', ']'], ['{', '}']] as const) {
      while (u.endsWith(close) && u.split(open).length < u.split(close).length) u = u.slice(0, -1)
    }
    u = u.replace(/[.,;:!?…]+$/u, '')
    try {
      const parsed = new URL(u)
      if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname.includes('.')) continue
    } catch {
      continue
    }
    if (u.length > 2000 || out.includes(u)) continue
    out.push(u)
    if (out.length >= max) break
  }
  return out
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => cp(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => cp(Number(d)))
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
}
const cp = (n: number) => (n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '')

const httpsOrNull = (v: string | null | undefined) => {
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === 'https:' && v.length <= 1000 ? u.toString() : null
  } catch {
    return null
  }
}
const textOrNull = (v: string | null | undefined, max: number) => {
  const t = v ? decodeHtmlEntities(v).replace(/\s+/g, ' ').trim() : ''
  return t ? t.slice(0, max) : null
}

/**
 * Normalise a preview before it is stored or sent: decoded + trimmed text,
 * https-only images/favicons (no mixed content, matches the posts CHECK).
 */
export function sanitizePreview(p: LinkPreview): LinkPreview {
  return {
    url: p.url.slice(0, 2000),
    title: textOrNull(p.title, 200),
    description: textOrNull(p.description, 300),
    image: httpsOrNull(p.image),
    site_name: textOrNull(p.site_name, 60),
    favicon: httpsOrNull(p.favicon),
    link_type: p.link_type,
  }
}

/** GitHub repo / user path → OG image that GitHub renders for that repo. */
export function githubOgImage(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.replace(/^www\./, '') !== 'github.com') return null
    const [owner, repo] = u.pathname.split('/').filter(Boolean)
    if (!owner) return null
    return repo ? `https://opengraph.githubassets.com/1/${owner}/${repo}` : `https://github.com/${owner}.png?size=400`
  } catch {
    return null
  }
}

/** Plain text of an X oEmbed blockquote (<p>…</p>), links/tags stripped. */
export function tweetTextFromOembed(html: string): string | null {
  const p = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1]
  if (!p) return null
  return textOrNull(p.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''), 300)
}
