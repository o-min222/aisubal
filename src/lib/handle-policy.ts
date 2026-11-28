import { msg as M } from '@/i18n/translate'

/**
 * @handle change policy (0032). The database enforces all of it (profile_change_handle,
 * members_handle_policy trigger, handle_history exclusion constraint); this module only
 * shapes the status for the UI and localizes the error codes.
 */
const HANDLE_CHANGE_LIMIT = 2
const HANDLE_WINDOW_DAYS = 14
const HANDLE_HOLD_DAYS = 14

export type HandleCheckState = 'same' | 'invalid' | 'taken' | 'on_hold' | 'own_hold' | 'available'
export type HandleHistoryRow = { old: string; new: string; changedAt: string; releasedAt: string }
export type HandleStatus = {
  current: string | null
  firstIsFree: boolean
  quota: { limit: number; windowDays: number; holdDays: number; used: number; remaining: number; nextAt: string | null; refillAt: string | null }
  check: { handle: string; state: HandleCheckState; heldUntil: string | null } | null
  history: HandleHistoryRow[]
}

type HandleErrorCode = 'handle_change_cooldown' | 'handle_on_hold' | 'handle_taken' | 'profile_handle_invalid' | 'handle_change_use_rpc'

export const HANDLE_ERRORS: Record<HandleErrorCode, string> = {
  handle_change_cooldown: M('핸들은 14일 동안 2번까지 바꿀 수 있어요. {date}부터 다시 바꿀 수 있어요.'),
  handle_on_hold: M('최근에 다른 멤버가 쓰던 핸들이라 14일 동안 보호 중이에요.'),
  handle_taken: M('이미 쓰는 핸들이에요. 다른 핸들을 골라주세요.'),
  profile_handle_invalid: M('핸들은 영문 소문자·숫자·_ 3~20자예요.'),
  handle_change_use_rpc: M('핸들은 프로필에서만 바꿀 수 있어요.'),
}

/** Error code from a Postgres/RPC error message ('profile_handle_taken' counts as taken). */
export function handleErrorCode(message: string): HandleErrorCode | null {
  if (message.includes('handle_change_cooldown')) return 'handle_change_cooldown'
  if (message.includes('handle_on_hold')) return 'handle_on_hold'
  if (message.includes('handle_taken')) return 'handle_taken'
  if (message.includes('profile_handle_invalid')) return 'profile_handle_invalid'
  if (message.includes('handle_change_use_rpc')) return 'handle_change_use_rpc'
  return null
}

/** Dates are shown in Korea time (the community's zone), in the viewer's language. */
export function formatHandleDate(iso: string | null | undefined, locale: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'ko-KR', {
    month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Seoul',
  }).format(d)
}

export const CHECK_LABEL: Record<HandleCheckState, string> = {
  same: M('지금 쓰는 핸들이에요.'),
  invalid: M('쓸 수 없는 핸들이에요 (영문 소문자·숫자·_ 3~20자, 예약된 이름 제외).'),
  taken: M('이미 쓰는 핸들이에요.'),
  on_hold: M('최근에 다른 멤버가 쓰던 핸들이라 14일 동안 보호 중이에요.'),
  own_hold: M('내가 전에 쓰던 핸들이에요. 되돌릴 수 있어요 (변경 1회로 세요).'),
  available: M('쓸 수 있어요.'),
}

/** Pure mirror of the DB quota for mock mode and tests: ≤2 changes per rolling 14 days. */
export function quotaFrom(changedAt: Date[], now = new Date()): HandleStatus['quota'] {
  const windowMs = HANDLE_WINDOW_DAYS * 86_400_000
  const recent = changedAt.filter((d) => now.getTime() - d.getTime() < windowMs).sort((a, b) => b.getTime() - a.getTime()).slice(0, HANDLE_CHANGE_LIMIT)
  const oldest = recent.length ? recent[recent.length - 1] : null
  return {
    limit: HANDLE_CHANGE_LIMIT, windowDays: HANDLE_WINDOW_DAYS, holdDays: HANDLE_HOLD_DAYS,
    used: recent.length,
    remaining: Math.max(0, HANDLE_CHANGE_LIMIT - recent.length),
    nextAt: recent.length >= HANDLE_CHANGE_LIMIT && oldest ? new Date(oldest.getTime() + windowMs).toISOString() : null,
    refillAt: oldest ? new Date(oldest.getTime() + windowMs).toISOString() : null,
  }
}
