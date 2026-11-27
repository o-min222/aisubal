import Link from 'next/link'
import { Flame, Newspaper, MessageSquareText, AtSign, MessageCircleQuestion, Repeat2, Award, Bell, Bot, CalendarCheck, CalendarClock, CalendarDays, CalendarX, Check, Heart, MessageCircle, PenLine, Sparkles, Ticket, UserPlus, Users, VenetianMask, Wrench, X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { relativeLabel } from '@/lib/relative-label'
import { getLocale, getT } from '@/i18n/server'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'
import { T } from '@/i18n/t'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { FRIEND_REQUESTS_HREF } from '@/lib/friend-requests'
import { MentionText } from '@/components/timeline/mention-text'

const KIND_ICON = {
  comment: MessageCircle,
  reply: AtSign,
  agent_reply: MessageCircle,
  agent_mention: AtSign,
  mention: AtSign,
  like: Heart,
  agent_like: Heart,
  follow: UserPlus,
  friend_request: Users,
  friend_accept: Users,
  invite_joined: Ticket,
  moim_invite: CalendarDays,
  moim_confirmed: CalendarCheck,
  moim_changed: CalendarClock,
  moim_cancelled: CalendarX,
  moim_tomorrow: CalendarClock,
  moim_today: CalendarClock,
  first_post: Sparkles,
  digest: Newspaper,
  digest_hot: Flame,
  digest_pick: Flame,
  digest_nudge: Newspaper,
  feedback: MessageSquareText,
  feedback_reply: MessageSquareText,
  feedback_approved: Check,
  feedback_deployed: Check,
  follow_post: PenLine,
  question: MessageCircleQuestion,
  repost: Repeat2,
  gallery_recommended: Sparkles,
  gallery_approved: Check,
  gallery_confirmed: Check,
  gallery_rejected: X,
  badge: Award,
  invite_refill: Ticket,
} as const

function Avatar({ n }: { n: NotificationItem }) {
  const a = n.actor
  if (a?.kind === 'member' && a.id) return <UserAvatar id={a.id} name={a.name || '멤버'} avatarUrl={a.avatarUrl} size="md" />
  if (a?.kind === 'agent' && n.category !== 'gallery') return <AgentAvatar name={a.name || 'AI'} brand={a.brand} avatarUrl={a.avatarUrl} size={40} />
  const gallery = n.category === 'gallery' && a?.kind !== 'agent'
  const badge = n.kind === 'badge' || n.kind === 'invite_refill'
  const KindIcon = KIND_ICON[n.kind as keyof typeof KIND_ICON]
  const Icon = n.kind === 'invite_refill' ? Ticket : badge ? Award : gallery ? Wrench : n.targetKind === 'moim' ? CalendarClock : a?.kind === 'agent' ? Bot : a?.kind === 'anon' ? VenetianMask : KindIcon ?? Heart
  return (
    <span className={`notif-ava is-${badge ? 'badge' : gallery ? 'gallery' : (a?.kind ?? 'someone')}`} aria-hidden>
      <Icon className="w-5 h-5" />
    </span>
  )
}

/**
 * One notification: who · what (one full sentence) · excerpt · when. The whole row is the link.
 * Rendered by a server action from whatever page the bell sits on, so it uses only client components every
 * page already registers (UserAvatar, T): the time is printed here, not by <RelativeTime>, which pages
 * without it in their tree don't have in their client manifest (the bell's 'This page couldn't load').
 * A kind this build doesn't know yet gets a neutral icon and sentence instead of a crash.
 */
export async function NotificationRow({ n }: { n: NotificationItem }) {
  const s = notificationSentence(n)
  const KindIcon = KIND_ICON[n.kind as keyof typeof KIND_ICON] ?? Bell
  const locale = await getLocale()
  // A86: a friend request opens the requests list directly (old rows still carry /me?tab=network…) and is
  // answered inline. The trigger deletes the row once answered, so any friend_request row is still pending.
  // Plain markup only (see above): the bell's delegated listener (useFriendRequestDelegate) does the POST.
  const respondTo = n.kind === 'friend_request' && n.actor?.kind === 'member' && n.actor.id ? { id: n.actor.id, name: n.actor.name || '' } : null
  const href = n.kind === 'friend_request' ? FRIEND_REQUESTS_HREF : n.link
  const row = (
    <Link href={href} className={`notif-row${n.unread ? ' unread' : ''}${respondTo ? ' has-actions' : ''}`} data-kind={n.kind}>
      <span className="notif-ava-wrap">
        <Avatar n={n} />
        <span className={`notif-kind k-${n.kind}`} aria-hidden>
          <KindIcon className="w-3 h-3" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="notif-text">
          <T s={s.s} vars={{ name: <b>{s.nameIsLabel ? <T>{s.name}</T> : s.name}</b>, n: s.n }} />
          {n.actor?.kind === 'agent' && <span className="agent-chip ml-1 align-middle">AI</span>}
        </span>
        {n.excerpt && <span className="notif-excerpt"><MentionText text={n.excerpt} link={false} /></span>}
        <time className="notif-time" dateTime={new Date(n.createdAt).toISOString()}>{relativeLabel(n.createdAt, locale)}</time>
      </span>
      {n.unread && <span className="notif-dot" aria-label="new" />}
    </Link>
  )
  if (!respondTo) return row
  return (
    <div className={`notif-item${n.unread ? ' unread' : ''}`}>
      {row}
      <FriendRequestInline id={respondTo.id} name={respondTo.name} />
    </div>
  )
}

/** A86: 수락 / 거절 as server markup; both outcomes are pre-rendered and shown via data-fr-done. */
async function FriendRequestInline({ id, name }: { id: string; name: string }) {
  const t = await getT()
  return (
    <div className="notif-actions" data-fr-member={id} data-fr-name={name}>
      <span className="fr-actions">
        <button type="button" className="fr-accept" data-fr-act="accept" aria-label={t('{name}님의 친구 신청 수락', { name })}>
          <T>수락</T>
        </button>
        <button type="button" className="fr-decline" data-fr-act="decline" aria-label={t('{name}님의 친구 신청 거절', { name })}>
          <T>거절</T>
        </button>
      </span>
      <span className="fr-done is-ok" data-fr-show="accepted" role="status">
        <Check className="w-3.5 h-3.5" aria-hidden /> <T>친구가 됐어요</T>
      </span>
      <span className="fr-done" data-fr-show="declined" role="status">
        <T>거절했어요</T>
      </span>
    </div>
  )
}
