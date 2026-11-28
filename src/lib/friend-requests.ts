import { msg } from '@/i18n/translate'

/**
 * A86 · incoming friend requests, pure parts. Requests were reaching people only through the bell, which
 * marks everything read on open, so they're also surfaced where people already are (the feed card, the
 * avatar dot, 친구·팔로워) and stay visible until answered.
 */

/** Where every request surface (notification, push, 'N개 더') opens: the 친구·팔로워 requests tab. */
export const FRIEND_REQUESTS_HREF = '/members/me/social?tab=requests'

/** Window event carrying the pending incoming count (detail: number), sent by the bell's poll. */
export const FRIEND_REQUESTS_EVENT = 'aisubal:friend-requests'

/** The feed card shows this many rows, then 'N개 더'. */
const FEED_CARD_MAX = 3

export type IncomingRequest = { id: string; name: string; avatarUrl: string | null }

/** Which rows the card shows and how many are left for 'N개 더' (total may exceed the list it got). */
export function cardSlice<T>(people: T[], total: number, max = FEED_CARD_MAX): { shown: T[]; more: number } {
  const shown = people.slice(0, max)
  return { shown, more: Math.max(0, Math.max(total, people.length) - shown.length) }
}

/**
 * The card is dismissed for a set of requests; a request that wasn't in that set brings it back.
 * The stored value is the sorted ids at dismiss time.
 */
export function dismissKey(ids: string[]): string {
  return [...ids].sort().join(',')
}
export function isDismissed(ids: string[], stored: string | null): boolean {
  if (!stored || ids.length === 0) return false
  const seen = new Set(stored.split(','))
  return ids.every((id) => seen.has(id))
}
export const DISMISS_STORAGE_KEY = 'aisubal:friend-requests-dismissed'

/** Push copy for a request: says what it is and what to do. */
export const PUSH_FRIEND_REQUEST_TITLE = msg('새 친구 신청')
export const PUSH_FRIEND_REQUEST_BODY = msg('{name}님이 친구 신청을 보냈어요. 눌러서 수락하거나 거절해 주세요.')
