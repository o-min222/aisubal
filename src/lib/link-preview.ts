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

export function getYoutubeId(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.slice(1).split('/')[0] || null
    }
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v')
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

function getMeta(html: string, property: string): string | null {
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

function absoluteUrl(base: string, maybeRelative: string | null): string | null {
  if (!maybeRelative) return null
  try {
    return new URL(maybeRelative, base).toString()
  } catch {
    return maybeRelative
  }
}

export async function fetchLinkPreview(url: string): Promise<LinkPreview> {
  const linkType = detectLinkType(url)

  // Fast path for YouTube — reliable thumbnail without scraping
  if (linkType === 'youtube') {
    const id = getYoutubeId(url)
    return {
      url,
      title: id ? `YouTube 영상` : 'YouTube',
      description: null,
      image: youtubeThumbnail(url),
      site_name: 'YouTube',
      favicon: 'https://www.youtube.com/favicon.ico',
      link_type: 'youtube',
    }
  }

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; AISubalBot/1.0; +https://aisubal.local)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    const html = await res.text()
    const title =
      getMeta(html, 'og:title') ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ||
      null
    const description =
      getMeta(html, 'og:description') || getMeta(html, 'description')
    const image = absoluteUrl(url, getMeta(html, 'og:image'))
    const siteName = getMeta(html, 'og:site_name')
    const favicon =
      absoluteUrl(
        url,
        html.match(
          /<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i
        )?.[1] || null
      ) || absoluteUrl(url, '/favicon.ico')

    return {
      url,
      title,
      description,
      image:
        image ||
        (linkType === 'github'
          ? 'https://opengraph.githubassets.com/1/github/github'
          : null),
      site_name:
        siteName ||
        (linkType === 'github'
          ? 'GitHub'
          : linkType === 'x'
            ? 'X'
            : new URL(url).hostname.replace(/^www\./, '')),
      favicon,
      link_type: linkType,
    }
  } catch {
    // Fallback preview when fetch fails (offline / blocked)
    const host = (() => {
      try {
        return new URL(url).hostname.replace(/^www\./, '')
      } catch {
        return 'link'
      }
    })()
    return {
      url,
      title: host,
      description: null,
      image: youtubeThumbnail(url),
      site_name: host,
      favicon: null,
      link_type: linkType,
    }
  }
}
