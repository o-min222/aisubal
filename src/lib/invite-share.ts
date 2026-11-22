/** Invite links (/i/{code}) and the short invite text (works in any messenger, SMS, DM or email). Pure: unit-tested. */

export const INVITE_COOKIE = 'aisubal_invite'
/** short-lived: long enough for Google login + coming back (30 min) */
export const INVITE_COOKIE_MAX_AGE = 30 * 60
export const SITE_ORIGIN = 'https://aisubal.vercel.app'

export type InviteStatus = 'valid' | 'used' | 'inactive' | 'invalid'
export type InvitePreview = { status: InviteStatus; inviter: { displayName: string; avatarUrl: string | null } | null }

export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.trim().toUpperCase()
  return /^[A-Z0-9]{8}$/.test(c) ? c : null
}

/** `lang` (non-default locales only) makes the link preview card render in the sharer's language. */
export function inviteUrl(code: string, origin: string = SITE_ORIGIN, lang?: string): string {
  const q = lang && lang !== 'ko' ? `?lang=${encodeURIComponent(lang)}` : ''
  return `${origin.replace(/\/$/, '')}/i/${encodeURIComponent(code)}${q}`
}

import { interpolate, msg } from '@/i18n/translate'

/** One-line description for the invite link preview and landing page. */
export const INVITE_TAGLINE = msg('초대받은 자만 들어올 수 있습니다.')

/** Two lines: who invited you, then the link on its own line (it gets the OG preview card).
 * The code is already in the URL, so there's no separate code line. */
export function inviteShareText(
  inviterName: string,
  code: string,
  origin: string = SITE_ORIGIN,
  t: (s: string, vars?: Record<string, string | number>) => string = interpolate,
  lang?: string,
): string {
  return [
    t(msg('{name}님이 당신을 AI쓰발에 초대했습니다. 초대받은 자만 들어올 수 있습니다.'), { name: inviterName }),
    inviteUrl(code, origin, lang),
  ].join('\n')
}

export const INVITE_STATUS_TEXT: Record<InviteStatus, string> = {
  valid: msg('사용할 수 있는 초대 코드예요.'),
  used: msg('이미 사용된 초대 코드예요. 초대한 분께 새 링크를 요청해 주세요.'),
  inactive: msg('아직 활성화되지 않은 초대 코드예요.'),
  invalid: msg('존재하지 않는 초대 코드예요. 링크를 다시 확인해 주세요.'),
}
