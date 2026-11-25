/**
 * A25 / A100: the share sheet gets a short title, optional caption, and the URL (messengers unfurl
 * `url`). The clipboard fallback puts that title on the first line and the URL on its own line, the
 * same way invite shares do. Restricted posts (friends/followers/private, group, 부캐, anon) never
 * put the title in the payload — just the site name and the link.
 */
export function postShareUrl(href: string | undefined, location: { origin: string; pathname: string }): string {
  const u = new URL(href ?? location.pathname, location.origin)
  return `${u.origin}${u.pathname}`
}

export type PostShareData = { url: string; title: string; text?: string }

export function postShareData(url: string, title?: string | null): PostShareData {
  const t = (title ?? '').replace(/\s+/g, ' ').trim()
  const short = t ? (t.length > 40 ? `${t.slice(0, 39)}…` : t) : 'AI쓰발'
  // KakaoTalk pastes `text`; keep the URL out of it so the unfurl stays on `url`.
  return short === 'AI쓰발' ? { url, title: short } : { url, title: short, text: short }
}

/** What the clipboard fallback copies: useful text plus the URL on its own line. */
export function shareClipboardText(url: string, title?: string | null): string {
  const d = postShareData(url, title)
  return d.text ? `${d.text}\n${url}` : url
}

/** Title allowed in the share payload: only 전체-회원, real-name, non-group, non-anon posts. */
export function shareSafeTitle(post: {
  title?: string | null
  visibility?: string | null
  isNickname?: boolean
  groupId?: string | null
  isOp?: boolean
  author?: { kind?: string } | null
}): string | null {
  if (post.isOp || post.isNickname || post.groupId) return null
  if (post.author?.kind === 'group') return null
  if (post.visibility && post.visibility !== 'members') return null
  const t = (post.title ?? '').replace(/\s+/g, ' ').trim()
  return t || null
}
