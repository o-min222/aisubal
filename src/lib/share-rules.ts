/**
 * A25: sharing a post gives its link, never its text (the share sheet's "copy" and
 * KakaoTalk paste whatever `text` holds). Title is short and safe for anon posts.
 */
export function postShareUrl(href: string | undefined, location: { origin: string; pathname: string }): string {
  const u = new URL(href ?? location.pathname, location.origin)
  return `${u.origin}${u.pathname}`
}

export function postShareData(url: string, title?: string | null): { url: string; title: string } {
  const t = (title ?? '').replace(/\s+/g, ' ').trim()
  return { url, title: t ? (t.length > 40 ? `${t.slice(0, 39)}…` : t) : 'AI쓰발' }
}
