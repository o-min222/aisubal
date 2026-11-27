import { msg as M } from '@/i18n/translate'
/**
 * Follow / friend rules shared by the UI, data layer and tests.
 * Follow is one-way and instant; a mutual follow is '맞팔' (NOT a friendship).
 * Friendship is a separate request → accept/decline flow.
 */
export type FriendState = 'none' | 'pending_out' | 'pending_in' | 'friends'

export type Relation = {
  isMe: boolean
  iFollow: boolean
  followsMe: boolean
  friend: FriendState
}

export const NO_RELATION: Relation = { isMe: false, iFollow: false, followsMe: false, friend: 'none' }

export function relationFromRow(r: Record<string, unknown> | null | undefined): Relation {
  if (!r) return NO_RELATION
  return {
    isMe: Boolean(r.is_me),
    iFollow: Boolean(r.i_follow),
    followsMe: Boolean(r.follows_me),
    friend: (['none', 'pending_out', 'pending_in', 'friends'].includes(String(r.friend)) ? r.friend : 'none') as FriendState,
  }
}

export const isMutual = (r: Relation) => r.iFollow && r.followsMe

/** The one badge we show next to a person: 친구 > 맞팔 > 팔로잉 > 나를 팔로우. */
export function relationBadge(r: Relation): { label: string; tone: 'friend' | 'mutual' | 'following' | 'follower' } | null {
  if (r.isMe) return null
  if (r.friend === 'friends') return { label: M('친구'), tone: 'friend' }
  if (isMutual(r)) return { label: M('맞팔'), tone: 'mutual' }
  if (r.iFollow) return { label: M('팔로잉'), tone: 'following' }
  if (r.followsMe) return { label: M('나를 팔로우'), tone: 'follower' }
  return null
}

/**
 * A82 / A126: the one relationship chip next to a name on post cards, comments and the profile peek.
 * MECE, same order as relationBadge: 친구 replaces 맞팔/팔로잉 (friendship is the stronger relation);
 * 맞팔 when we follow each other; 팔로잉 when only I follow; nothing otherwise (the "+ 팔로우" CTA is separate).
 */
export function nameChip(r: { iFollow: boolean; followsMe?: boolean; friend?: FriendState }): '친구' | '맞팔' | '팔로잉' | null {
  if (r.friend === 'friends') return '친구'
  if (!r.iFollow) return null
  return r.followsMe ? '맞팔' : '팔로잉'
}

/** Ranking for social proof: friends → people I follow → others (me last). */
export function relationRank(r: Relation): number {
  if (r.isMe) return 3
  if (r.friend === 'friends') return 0
  if (r.iFollow) return 1
  return 2
}

export function sortByRelation<T>(items: T[], rel: (t: T) => Relation): T[] {
  return items
    .map((t, i) => ({ t, i, k: relationRank(rel(t)) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.t)
}

/** '내 친구 중 3명이 써요' style header. */
export function socialProofLine(relations: Relation[], verb = '써요'): string {
  const others = relations.filter((r) => !r.isMe)
  const friends = others.filter((r) => r.friend === 'friends').length
  const following = others.filter((r) => r.friend !== 'friends' && r.iFollow).length
  if (friends > 0) return `내 친구 중 ${friends}명이 ${verb}`
  if (following > 0) return `내가 팔로우하는 사람 중 ${following}명이 ${verb}`
  if (others.length > 0) return `멤버 ${others.length}명이 ${verb}`
  return relations.some((r) => r.isMe) ? `아직 나만 ${verb}` : `아직 쓰는 멤버가 없어요`
}

export function friendActionLabel(state: FriendState): string {
  switch (state) {
    case 'friends':
      return '친구'
    case 'pending_out':
      return '요청 보냄'
    case 'pending_in':
      return '친구 요청 수락'
    default:
      return '친구 신청'
  }
}

export type FeedScope = 'all' | 'for_you' | 'following' | 'friends' | 'popular'
export const FEED_SCOPES: Array<{ id: FeedScope; label: string }> = [
  { id: 'all', label: M('전체') },
  { id: 'for_you', label: M('추천||feed tab') },
  { id: 'following', label: M('팔로잉') },
  { id: 'friends', label: M('친구') },
  { id: 'popular', label: M('인기') },
]
/** A59: the feed filter lives in ?f= (older ?scope= links still parse). */
export function feedHref(scope: FeedScope): string {
  return scope === 'all' ? '/feed' : `/feed?f=${scope}`
}
export function parseFeedScope(v: string | null | undefined): FeedScope {
  return v === 'for_you' || v === 'following' || v === 'friends' || v === 'popular' ? v : 'all'
}
/** 인기: last 14 days, most liked/replied first. */
export const POPULAR_DAYS = 14

export const SOCIAL_ERRORS: Record<string, string> = {
  social_self: '나 자신은 팔로우하거나 친구로 추가할 수 없어요.',
  social_member_not_found: '멤버를 찾을 수 없어요.',
  social_rate_limited: '오늘은 더 이상 요청할 수 없어요. 내일 다시 시도해주세요.',
  social_friend_cooldown: '상대가 최근에 요청을 거절했어요. 2주 뒤에 다시 보낼 수 있어요.',
  social_request_not_found: '받은 친구 요청이 없어요.',
  social_forbidden: '볼 수 없는 목록이에요.',
}

export function socialErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  const key = Object.keys(SOCIAL_ERRORS).find((k) => msg.includes(k))
  return key ? SOCIAL_ERRORS[key] : M('처리하지 못했어요.')
}
