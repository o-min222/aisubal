/** A61/A120/A131: client side of the 새 소식 digest. The send rules live in 0150 digest__run. */
export const SEEN_KEY = 'aisubal_seen_at'
export const SEEN_EVERY_MS = 10 * 60 * 1000

export function shouldPingSeen(last: number | null, now: number): boolean {
  return last === null || !Number.isFinite(last) || now - last >= SEEN_EVERY_MS || now < last
}

/** Matches digest__teaser (0150): @handle (or display name) and first ~90 characters of the body. */
const DIGEST_TEASER_CHARS = 90
export function digestTeaser(who: string, body: string, title = ''): string {
  const raw = who.replace(/\s+/g, ' ').trim()
  const label = (raw.startsWith('@') ? raw.slice(0, 21) : raw ? `@${raw.slice(0, 20)}` : '멤버')
  const text = (body || title).replace(/\s+/g, ' ').trim().slice(0, DIGEST_TEASER_CHARS) || '새 글'
  return `${label}: ${text}`
}
