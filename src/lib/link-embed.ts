import { getYoutubeId } from '@/lib/link-preview'

/**
 * A58: which links get an inline player (click-to-load facade) and which hosts get an oEmbed card.
 * Pure: no network. The player is never loaded until the reader taps, and never autoplays.
 */
export type Embed = { kind: 'youtube' | 'vimeo'; id: string; src: string; vertical: boolean }

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.replace(/^(www\.|m\.)/, '') : null
  } catch {
    return null
  }
}

export function vimeoId(url: string): string | null {
  const h = hostOf(url)
  if (h !== 'vimeo.com' && h !== 'player.vimeo.com') return null
  const m = new URL(url).pathname.match(/^\/(?:video\/)?(\d{6,12})(?:\/|$)/)
  return m?.[1] ?? null
}

export function embedOf(url: string): Embed | null {
  const h = hostOf(url)
  if (!h) return null
  if (h.endsWith('youtube.com') || h === 'youtu.be' || h === 'youtube-nocookie.com') {
    const id = getYoutubeId(url)
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null
    const vertical = /\/shorts\//.test(new URL(url).pathname)
    return { kind: 'youtube', id, vertical, src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1` }
  }
  const v = vimeoId(url)
  if (v) return { kind: 'vimeo', id: v, vertical: false, src: `https://player.vimeo.com/video/${v}?dnt=1` }
  return null
}

/** hosts whose card comes from oEmbed / OG instead of a generic page fetch */
export type SocialKind = 'vimeo' | 'tiktok' | 'instagram'
export function socialKind(url: string): SocialKind | null {
  const h = hostOf(url)
  if (!h) return null
  if (h === 'vimeo.com') return 'vimeo'
  if (h === 'tiktok.com' || h.endsWith('.tiktok.com')) return 'tiktok'
  if (h === 'instagram.com') return 'instagram'
  return null
}

/** A58: only the first link of a post expands into a card or player; the rest stay inline links */
export const EXPANDED_LINKS = 1
