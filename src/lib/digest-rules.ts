/** A61/A120: client side of the 새 소식 digest. The send rules live in 0111/0142 digest__run. */
export const SEEN_KEY = 'aisubal_seen_at'
export const SEEN_EVERY_MS = 10 * 60 * 1000

export function shouldPingSeen(last: number | null, now: number): boolean {
  return last === null || !Number.isFinite(last) || now - last >= SEEN_EVERY_MS || now < last
}

/** Matches digest__teaser (0142): author · first ~56 characters of the body. */
export const DIGEST_TEASER_CHARS = 56
export function digestTeaser(authorName: string, body: string, title = ''): string {
  const name = authorName.replace(/\s+/g, ' ').trim().slice(0, 20) || '멤버'
  const text = (body || title).replace(/\s+/g, ' ').trim().slice(0, DIGEST_TEASER_CHARS) || '새 글'
  return `${name} · ${text}`
}
