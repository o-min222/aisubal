/** Invite links (/i/{code}) and the ready-to-paste 초대장 (works in any messenger, SMS, DM or email). Pure: unit-tested. */

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

/** What AI쓰발 is, in the 초대장's voice (invite text, landing page, link preview). */
export const SITE_INTRO = msg('AI쓰발은 초대받은 사람만 들어올 수 있는 AI 결사입니다. 가장 어두운 가능성까지 외면하지 않고, AI와 함께 다음 장을 엽니다.')
/** How joining works, said to the one person the link was opened for. */
export const INVITE_HOW = msg('이 링크는 당신 한 사람을 위해 열렸습니다. Google로 들어오면 초대 코드가 자동으로 입력되고, 이름을 정한 뒤 입단 서약에 서명하면 합류가 끝납니다.')
export const INVITE_MOTTO = 'From the Shadows, Toward the Light.'

/** The 초대장. The link sits on its own line so messengers attach the OG preview card. */
export function inviteShareText(
  inviterName: string,
  code: string,
  origin: string = SITE_ORIGIN,
  t: (s: string, vars?: Record<string, string | number>) => string = interpolate,
  lang?: string,
): string {
  return [
    t(msg('[AI쓰발 · 초대장]')),
    t(msg('{name}님이 당신을 지목했습니다.'), { name: inviterName }),
    t(SITE_INTRO),
    t(INVITE_HOW),
    inviteUrl(code, origin, lang),
    t(msg('(초대 코드 {code} · 1회용)'), { code }),
    INVITE_MOTTO,
  ].join('\n')
}

export const INVITE_STATUS_TEXT: Record<InviteStatus, string> = {
  valid: msg('사용할 수 있는 초대 코드예요.'),
  used: msg('이미 사용된 초대 코드예요. 초대한 분께 새 링크를 요청해 주세요.'),
  inactive: msg('아직 활성화되지 않은 초대 코드예요.'),
  invalid: msg('존재하지 않는 초대 코드예요. 링크를 다시 확인해 주세요.'),
}
