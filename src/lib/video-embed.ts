import { getYoutubeId } from '@/lib/link-preview'

export type VideoEmbed = { provider: 'youtube' | 'vimeo' | 'x'; id: string; embedUrl: string; thumb: string | null }

/**
 * Click-to-play embeds for list cards. Ids are matched strictly so the iframe
 * src can only ever point at the provider's own player (privacy-enhanced YouTube).
 */
export function videoEmbed(url: string, image?: string | null): VideoEmbed | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www|m)\./, '')
  if (host === 'youtube.com' || host === 'youtu.be' || host === 'music.youtube.com') {
    const id = getYoutubeId(url)
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null
    return { provider: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`, thumb: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = u.pathname.match(/(?:^|\/)(\d{5,12})(?:\/|$)/)?.[1]
    if (!id) return null
    return { provider: 'vimeo', id, embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&dnt=1`, thumb: image && /^https:\/\//.test(image) ? image : null }
  }
  if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com' || host === 'mobile.x.com') {
    const id = u.pathname.match(/^\/[A-Za-z0-9_]{1,15}\/status(?:es)?\/(\d{5,25})(?:\/|$)/)?.[1]
    if (!id) return null
    return { provider: 'x', id, embedUrl: `https://platform.twitter.com/embed/Tweet.html?id=${id}&dnt=true`, thumb: null }
  }
  return null
}
