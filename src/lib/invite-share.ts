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

export function inviteUrl(code: string, origin: string = SITE_ORIGIN): string {
  return `${origin.replace(/\/$/, '')}/i/${encodeURIComponent(code)}`
}

export const SITE_INTRO = 'AI쓰발은 프롬프트·MCP·에이전트 스킬과 AI 툴 사용기를 나누는 초대 전용 AI 커뮤니티예요.'

/** Ready-to-paste KakaoTalk message (the link line alone gets the OG preview card). */
export function inviteShareText(inviterName: string, code: string, origin: string = SITE_ORIGIN): string {
  return [
    `[AI쓰발 초대장] ${inviterName}님이 초대했어요 🙌`,
    SITE_INTRO,
    '아래 링크에서 Google로 로그인하면 초대 코드가 자동으로 입력돼요.',
    inviteUrl(code, origin),
    `(초대 코드 ${code} · 1회용)`,
  ].join('\n')
}

export const INVITE_STATUS_TEXT: Record<InviteStatus, string> = {
  valid: '사용할 수 있는 초대 코드예요.',
  used: '이미 사용된 초대 코드예요. 초대한 분께 새 링크를 요청해 주세요.',
  inactive: '아직 활성화되지 않은 초대 코드예요.',
  invalid: '존재하지 않는 초대 코드예요. 링크를 다시 확인해 주세요.',
}
