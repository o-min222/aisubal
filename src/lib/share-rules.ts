/**
 * A25 / A101: the share sheet's title is always the service name 'AI쓰발'. Eligible 전체-회원
 * real-name posts may also pass a short teaser as `text` (never an author name, nickname, handle
 * or avatar; the URL stays out of `text` so Kakao can unfurl `url`). The clipboard fallback is
 * 'AI쓰발', the teaser, then the URL on its own line. Restricted posts (friends/followers/private,
 * group, 부캐, anon) share only the site name and the link.
 */
import { clipLine, SHARE_OG_TITLE, TEASER_MAX } from '@/lib/share-teaser'

export function postShareUrl(href: string | undefined, location: { origin: string; pathname: string }): string {
  const u = new URL(href ?? location.pathname, location.origin)
  return `${u.origin}${u.pathname}`
}

export type PostShareData = { url: string; title: string; text?: string }

export function postShareData(url: string, teaser?: string | null): PostShareData {
  const line = clipLine(teaser, TEASER_MAX)
  return line ? { url, title: SHARE_OG_TITLE, text: line } : { url, title: SHARE_OG_TITLE }
}

/** What the clipboard fallback copies: service name, optional teaser, URL on its own line. */
export function shareClipboardText(url: string, teaser?: string | null): string {
  const d = postShareData(url, teaser)
  return d.text ? `${d.title}\n${d.text}\n${url}` : url
}

function shareEligible(post: {
  visibility?: string | null
  isNickname?: boolean
  groupId?: string | null
  isOp?: boolean
  author?: { kind?: string } | null
}): boolean {
  if (post.isOp || post.isNickname || post.groupId) return false
  if (post.author?.kind === 'group') return false
  if (post.visibility && post.visibility !== 'members') return false
  return true
}

/** First-line teaser allowed in the share payload (no author identity). */
export function shareSafeTeaser(post: {
  title?: string | null
  body?: string | null
  visibility?: string | null
  isNickname?: boolean
  groupId?: string | null
  isOp?: boolean
  author?: { kind?: string } | null
}): string | null {
  if (!shareEligible(post)) return null
  const title = (post.title ?? '').replace(/\s+/g, ' ').trim()
  if (title) return clipLine(title, TEASER_MAX)
  const body = (post.body ?? '').replace(/\r\n/g, '\n')
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\s+/g, ' ').trim()
    const clipped = clipLine(line, TEASER_MAX)
    if (clipped) return clipped
  }
  return null
}
