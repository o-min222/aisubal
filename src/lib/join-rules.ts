/** A57: pure rules for the public waitlist (/join). Mirrors waitlist_join (0108). */
export const JOIN_REASON_MAX = 300
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

export function joinEmailError(email: string): string | null {
  const e = email.trim()
  if (!e) return '이메일을 입력해 주세요.'
  if (e.length > 254 || !EMAIL.test(e)) return '이메일 주소를 확인해 주세요.'
  return null
}

/** where the visitor came from (?from=teaser); anything else is dropped */
export function joinSource(raw: string | null | undefined): string | null {
  return raw && /^[a-z0-9_-]{1,32}$/.test(raw) ? raw : null
}
