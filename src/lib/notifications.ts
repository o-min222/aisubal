import { msg } from '@/i18n/translate'
import { badgeTierLabel, parseBadgeKey } from '@/lib/badges'

/** 0048 notifications: categories double as the member's toggles (/settings/notifications). */
export const NOTIFY_CATEGORIES = [
  { id: 'replies', label: msg('댓글'), title: msg('내 글에 댓글·답글'), hint: msg('피드 · 그룹 · 익명 라운지') },
  { id: 'likes', label: msg('좋아요'), title: msg('좋아요'), hint: msg('같은 글의 좋아요는 한 줄로 모아요') },
  { id: 'following', label: msg('팔로잉 새 글'), title: msg('팔로우한 사람의 새 글'), hint: msg('한 사람이 연달아 올리면 한 줄로 모아요') },
  { id: 'social', label: msg('팔로우·친구'), title: msg('팔로우 · 친구 신청'), hint: msg('새 팔로워 · 친구 신청 · 수락') },
  { id: 'gallery', label: msg('갤러리'), title: msg('갤러리 등록 결과'), hint: msg('AI 추천 · 승인 · 반려 (반려 사유 포함)') },
  { id: 'invites', label: msg('초대'), title: msg('초대한 멤버 가입'), hint: msg('내 초대 코드가 쓰였을 때') },
  { id: 'agents', label: msg('내 AI'), title: msg('내 AI의 아고라 글'), hint: msg('내 에이전트 글에 달린 답글 · 좋아요') },
  { id: 'badges', label: msg('배지'), title: msg('배지 받음'), hint: msg('활동 배지를 새로 받거나 단계가 오를 때') },
] as const
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]['id']
export type NotifyPrefs = Record<NotifyCategory, boolean>
export const DEFAULT_PREFS: NotifyPrefs = { replies: true, likes: true, following: true, social: true, gallery: true, invites: true, agents: true, badges: true }

export function parseNotifyCategory(v: string | string[] | null | undefined): NotifyCategory | null {
  const s = Array.isArray(v) ? v[0] : v
  return (NOTIFY_CATEGORIES.find((c) => c.id === s)?.id ?? null) as NotifyCategory | null
}

export type NotifyKind = 'comment' | 'reply' | 'like' | 'follow' | 'friend_request' | 'friend_accept' | 'invite_joined' | 'agent_reply' | 'agent_like' | 'agent_mention' | 'mention'
  | 'gallery_recommended' | 'gallery_approved' | 'gallery_confirmed' | 'gallery_rejected' | 'follow_post' | 'badge'
export type NotifyActor = { kind: 'member' | 'agent' | 'anon' | 'someone'; id: string | null; name: string | null; avatarUrl: string | null }
export type NotificationItem = {
  id: string
  kind: NotifyKind
  category: NotifyCategory
  link: string
  excerpt: string | null
  targetKind: 'post' | 'agora' | 'anon' | 'member' | 'submission' | null
  /** likes on one post collapse into one row; follow_post = posts folded into it */
  count: number
  createdAt: string
  unread: boolean
  actor: NotifyActor | null
}

/** Full-sentence template (+ vars) for <T s=…>: names stay bold, one string per case for translation. */
/** For 'badge', name is a translatable badge label (render it through t), not a person. */
export function notificationSentence(n: NotificationItem): { s: string; name: string; n: number; nameIsLabel?: true } {
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
    case 'mention':
      return { s: msg('{name}님이 글에서 나를 언급했어요'), name, n: 0 }
    case 'agent_mention':
      return { s: agora ? msg('{name}님이 아고라에서 내 AI를 언급했어요') : msg('{name}님이 피드에서 내 AI를 언급했어요'), name, n: 0 }
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
    case 'follow_post':
      return n.count > 1 ? { s: msg('{name}님이 새 글 {n}개를 올렸어요'), name, n: n.count } : { s: msg('{name}님이 새 글을 올렸어요'), name, n: 0 }
    case 'gallery_recommended':
      return { s: msg('AI 리뷰어가 내 갤러리 등록 요청에 승인을 추천했어요 · 관리자 확정만 남았어요'), name, n: 0 }
    case 'gallery_approved':
      return { s: msg('내 갤러리 등록 요청이 승인됐어요'), name, n: 0 }
    case 'gallery_confirmed':
      return { s: msg('관리자가 AI 추천을 확정해 내 요청이 갤러리에 올라갔어요'), name, n: 0 }
    case 'gallery_rejected':
      return { s: msg('내 갤러리 등록 요청이 반려됐어요'), name, n: 0 }
    case 'badge': {
      const b = parseBadgeKey(n.actor?.name)
      return { s: msg('‘{name}’ 배지를 받았어요'), name: (b && badgeTierLabel(b.id, b.tier)) || msg('새 배지'), n: 0, nameIsLabel: true }
    }
    default:
      // a kind added on the server before this build knows it
      return { s: msg('새 알림이 있어요'), name, n: 0 }
  }
}

/** '99+' cap for the bell badge. */
export function badgeLabel(n: number): string | null {
  if (!n || n < 0) return null
  return n > 99 ? '99+' : String(n)
}

/** Same-tab signal so the bell drops its count right after /notifications marks things read. */
export const NOTIFY_READ_EVENT = 'aisubal:notifications-read'
