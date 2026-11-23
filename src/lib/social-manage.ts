import { msg as M } from '@/i18n/translate'
import type { Relation } from './social-rules'

/**
 * A48 · 친구·팔로워 관리 (own /members/me/social). Membership in each tab is derived from the
 * live relation, so an action (unfollow, remove follower, accept…) moves people between tabs
 * without a refetch. 팔로워 = people who follow me; friends also see 팔로워 공개 posts (A43).
 */
export type ManageTab = 'friends' | 'followers' | 'following' | 'requests'
export const MANAGE_TABS: Array<{ id: ManageTab; label: string }> = [
  { id: 'friends', label: M('친구') },
  { id: 'followers', label: M('팔로워') },
  { id: 'following', label: M('팔로잉') },
  { id: 'requests', label: M('요청') },
]

export function parseManageTab(v: string | null | undefined): ManageTab {
  if (v === 'sent') return 'requests'
  return v === 'followers' || v === 'following' || v === 'requests' ? v : 'friends'
}

export function inManageTab(tab: ManageTab, r: Relation): boolean {
  if (r.isMe) return false
  if (tab === 'friends') return r.friend === 'friends'
  if (tab === 'followers') return r.followsMe
  if (tab === 'following') return r.iFollow
  return r.friend === 'pending_in' || r.friend === 'pending_out'
}

export function matchesPerson(p: { name: string; handle?: string | null }, q: string): boolean {
  const t = q.trim().replace(/^@/, '').toLowerCase()
  if (!t) return true
  return p.name.toLowerCase().includes(t) || (p.handle ?? '').toLowerCase().includes(t)
}

export type ManageAction = 'unfriend' | 'cancel_request' | 'request' | 'accept' | 'decline' | 'follow' | 'unfollow' | 'remove_follower'
export const MANAGE_ACTION_LABEL: Record<ManageAction, string> = {
  unfriend: M('친구 끊기'),
  cancel_request: M('친구 요청 취소'),
  request: M('친구 신청'),
  accept: M('친구 수락'),
  decline: M('거절'),
  follow: M('팔로우'),
  unfollow: M('팔로우 취소'),
  remove_follower: M('팔로워에서 삭제'),
}
/** Destructive ones ask first. */
export const MANAGE_CONFIRM: Partial<Record<ManageAction, string>> = {
  unfriend: M('친구를 끊을까요? 팔로우는 그대로 유지돼요.'),
  unfollow: M('팔로우를 취소할까요?'),
  remove_follower: M('팔로워에서 삭제할까요? 상대에게 알림은 가지 않고, 친구라면 ‘팔로워 공개’ 글은 계속 보여요.'),
}

/** The ⋯ menu for one row: friend action first, then follow, then remove follower. */
export function manageActions(r: Relation): ManageAction[] {
  if (r.isMe) return []
  const out: ManageAction[] = []
  if (r.friend === 'friends') out.push('unfriend')
  else if (r.friend === 'pending_out') out.push('cancel_request')
  else if (r.friend === 'none') out.push('request')
  out.push(r.iFollow ? 'unfollow' : 'follow')
  if (r.followsMe) out.push('remove_follower')
  return out
}

export function actionRequest(a: ManageAction, memberId: string): { url: string; body: Record<string, unknown> } {
  if (a === 'follow' || a === 'unfollow') return { url: '/api/social/follow', body: { memberId, follow: a === 'follow' } }
  if (a === 'remove_follower') return { url: '/api/social/follower', body: { memberId } }
  const action = a === 'unfriend' || a === 'cancel_request' ? 'remove' : a
  return { url: '/api/social/friend', body: { memberId, action } }
}

/** Optimistic relation after an action (server's answer replaces it). */
export function predictRelation(r: Relation, a: ManageAction): Relation {
  switch (a) {
    case 'unfriend':
    case 'cancel_request':
    case 'decline':
      return { ...r, friend: 'none' }
    case 'request':
      return { ...r, friend: 'pending_out' }
    case 'accept':
      return { ...r, friend: 'friends' }
    case 'follow':
      return { ...r, iFollow: true }
    case 'unfollow':
      return { ...r, iFollow: false }
    case 'remove_follower':
      return { ...r, followsMe: false }
  }
}
