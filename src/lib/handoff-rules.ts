/**
 * Desktop → phone setup handoff (D1). The token is 256 random bits, base64url; only its SHA-256 is
 * stored. It travels in the URL fragment (/h#<token>), which browsers never send to a server, so it
 * can't land in access logs; the phone page posts it in a request body. Pure: no I/O.
 */
export const HANDOFF_PATH = '/h'
export const HANDOFF_TTL_MS = 10 * 60 * 1000
export const HANDOFF_STORAGE_KEY = 'aisubal_handoff'
/** Cookie the OAuth callback reads to come back to /h after a phone sign-in (no token in it). */
export const AFTER_LOGIN_COOKIE = 'aisubal_after_login'
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function newHandoffToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function isHandoffToken(t: unknown): t is string {
  return typeof t === 'string' && TOKEN_RE.test(t)
}

export async function hashHandoffToken(token: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

export function handoffUrl(origin: string, token: string): string {
  return `${origin}${HANDOFF_PATH}#${token}`
}

/** The token from location.hash ("#<token>"), else null. */
export function tokenFromFragment(hash: string): string | null {
  const t = hash.replace(/^#/, '')
  return isHandoffToken(t) ? t : null
}

/** A same-origin relative path, else null (open-redirect guard). */
export function safeNextPath(p: string | null | undefined): string | null {
  return p && p.startsWith('/') && !p.startsWith('//') && !p.startsWith('/\\') ? p : null
}

export type AppPlatform = 'standalone' | 'ios' | 'android' | 'mobile' | 'desktop'

/** Which 홈 화면에 추가 path fits this browser. */
export function detectPlatform(ua: string, opts: { standalone: boolean; touch: boolean }): AppPlatform {
  if (opts.standalone) return 'standalone'
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && opts.touch)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  if (/Mobi/i.test(ua)) return 'mobile'
  return 'desktop'
}
