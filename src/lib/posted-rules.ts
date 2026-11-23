/**
 * A23: after publishing a root post the composer goes to the timeline it was published to,
 * with ?posted=<id> so that timeline can scroll to the new card and tint it once.
 */
export const POSTED_PARAM = 'posted'

/** `base` is a path (`/feed`, `/anon`, `/groups/x`); the timeline opens at its first page. */
export function postedHref(base: string, id: string): string {
  const path = base.split(/[?#]/)[0] || '/feed'
  return `${path}?${POSTED_PARAM}=${encodeURIComponent(id)}`
}

/** The same URL without ?posted (so a reload or share doesn't replay the highlight). */
export function withoutPosted(pathname: string, search: string, hash = ''): string {
  const q = new URLSearchParams(search)
  q.delete(POSTED_PARAM)
  const s = q.toString()
  return `${pathname}${s ? `?${s}` : ''}${hash}`
}
