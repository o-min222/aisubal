/** A61: client side of the 새 소식 digest. The send rules themselves live in 0110 digest__run. */
export const SEEN_KEY = 'aisubal_seen_at'
export const SEEN_EVERY_MS = 10 * 60 * 1000

export function shouldPingSeen(last: number | null, now: number): boolean {
  return last === null || !Number.isFinite(last) || now - last >= SEEN_EVERY_MS || now < last
}
