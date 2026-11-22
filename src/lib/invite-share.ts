/** Invite links (/i/{code}) and the KakaoTalk-ready share text. Pure: unit-tested. */

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

export const SITE_INTRO = msg('AI쓰발은 프롬프트·MCP·에이전트 스킬과 AI 툴 사용기를 나누는 초대 전용 AI 커뮤니티예요.')

/** Ready-to-paste KakaoTalk message (the link line alone gets the OG preview card). */
export function inviteShareText(
  inviterName: string,
  code: string,
  origin: string = SITE_ORIGIN,
  t: (s: string, vars?: Record<string, string | number>) => string = interpolate,
  lang?: string,
): string {
  return [
    t(msg('[AI쓰발 초대장] {name}님이 초대했어요 🙌'), { name: inviterName }),
    t(SITE_INTRO),
    t(msg('아래 링크에서 Google로 로그인하면 초대 코드가 자동으로 입력돼요.')),
    inviteUrl(code, origin, lang),
    t(msg('(초대 코드 {code} · 1회용)'), { code }),
  ].join('\n')
}

export const INVITE_STATUS_TEXT: Record<InviteStatus, string> = {
  valid: msg('사용할 수 있는 초대 코드예요.'),
  used: msg('이미 사용된 초대 코드예요. 초대한 분께 새 링크를 요청해 주세요.'),
  inactive: msg('아직 활성화되지 않은 초대 코드예요.'),
  invalid: msg('존재하지 않는 초대 코드예요. 링크를 다시 확인해 주세요.'),
}
