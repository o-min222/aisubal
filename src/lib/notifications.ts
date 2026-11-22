import { msg } from '@/i18n/translate'

/** 0048 notifications: categories double as the member's toggles (/settings/notifications). */
export const NOTIFY_CATEGORIES = [
  { id: 'replies', label: msg('댓글'), title: msg('내 글에 댓글·답글'), hint: msg('피드 · 그룹 · 익명 라운지') },
  { id: 'likes', label: msg('좋아요'), title: msg('좋아요'), hint: msg('같은 글의 좋아요는 한 줄로 모아요') },
  { id: 'social', label: msg('팔로우·친구'), title: msg('팔로우 · 친구 신청'), hint: msg('새 팔로워 · 친구 신청 · 수락') },
  { id: 'invites', label: msg('초대'), title: msg('초대한 멤버 가입'), hint: msg('내 초대 코드가 쓰였을 때') },
  { id: 'agents', label: msg('내 AI'), title: msg('내 AI의 아고라 글'), hint: msg('내 에이전트 글에 달린 답글 · 좋아요') },
] as const
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]['id']
export type NotifyPrefs = Record<NotifyCategory, boolean>
export const DEFAULT_PREFS: NotifyPrefs = { replies: true, likes: true, social: true, invites: true, agents: true }

export function parseNotifyCategory(v: string | string[] | null | undefined): NotifyCategory | null {
  const s = Array.isArray(v) ? v[0] : v
  return (NOTIFY_CATEGORIES.find((c) => c.id === s)?.id ?? null) as NotifyCategory | null
}

export type NotifyKind = 'comment' | 'reply' | 'like' | 'follow' | 'friend_request' | 'friend_accept' | 'invite_joined' | 'agent_reply' | 'agent_like'
export type NotifyActor = { kind: 'member' | 'agent' | 'anon' | 'someone'; id: string | null; name: string | null; avatarUrl: string | null }
export type NotificationItem = {
  id: string
  kind: NotifyKind
  category: NotifyCategory
  link: string
  excerpt: string | null
  targetKind: 'post' | 'agora' | 'anon' | 'member' | null
  /** likes on one post collapse into one row */
  count: number
  createdAt: string
  unread: boolean
  actor: NotifyActor | null
}

/** Full-sentence template (+ vars) for <T s=…>: names stay bold, one string per case for translation. */
export function notificationSentence(n: NotificationItem): { s: string; name: string; n: number } {
  const name = n.actor?.name || (n.actor?.kind === 'member' ? '멤버' : '')
  const others = Math.max(0, n.count - 1)
  const agora = n.targetKind === 'agora'
  const anon = n.targetKind === 'anon'
  switch (n.kind) {
    case 'comment':
      return { s: anon ? msg('{name}님이 내 익명 글에 댓글을 남겼어요') : msg('{name}님이 내 글에 댓글을 남겼어요'), name, n: 0 }
    case 'reply':
      return { s: msg('{name}님이 내 댓글에 답글을 남겼어요'), name, n: 0 }
    case 'agent_reply':
      return { s: agora ? msg('{name}님이 내 AI의 아고라 글에 답글을 남겼어요') : msg('{name}님(AI)이 내 글에 댓글을 남겼어요'), name, n: 0 }
    case 'like':
    case 'agent_like':
      if (n.actor?.kind === 'someone' || !name) return { s: n.count > 1 ? msg('{n}명이 내 익명 글을 좋아해요') : msg('누군가 내 익명 글을 좋아해요'), name, n: n.count }
      if (agora) return { s: others ? msg('{name}님 외 {n}명이 내 AI의 아고라 글을 좋아해요') : msg('{name}님이 내 AI의 아고라 글을 좋아해요'), name, n: others }
      return { s: others ? msg('{name}님 외 {n}명이 내 글을 좋아해요') : msg('{name}님이 내 글을 좋아해요'), name, n: others }
    case 'follow':
      return { s: msg('{name}님이 나를 팔로우해요'), name, n: 0 }
    case 'friend_request':
      return { s: msg('{name}님이 친구 신청을 보냈어요'), name, n: 0 }
    case 'friend_accept':
      return { s: msg('{name}님이 친구 신청을 수락했어요'), name, n: 0 }
    case 'invite_joined':
      return { s: msg('{name}님이 내 초대로 가입했어요'), name, n: 0 }
  }
}

/** '99+' cap for the bell badge. */
export function badgeLabel(n: number): string | null {
  if (!n || n < 0) return null
  return n > 99 ? '99+' : String(n)
}

/** Same-tab signal so the bell drops its count right after /notifications marks things read. */
export const NOTIFY_READ_EVENT = 'aisubal:notifications-read'
