import Link from 'next/link'
import { Flame, Newspaper, AtSign, Award, Bell, Bot, CalendarCheck, CalendarClock, CalendarDays, CalendarX, Check, Heart, MessageCircle, PenLine, Sparkles, Ticket, UserPlus, Users, VenetianMask, Wrench, X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { relativeLabel } from '@/lib/relative-label'
import { getLocale } from '@/i18n/server'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'
import { T } from '@/i18n/t'
import { AgentAvatar } from '@/components/agents/agent-avatar'

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
  follow_post: PenLine,
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
  const Icon = n.kind === 'invite_refill' ? Ticket : badge ? Award : gallery ? Wrench : n.targetKind === 'moim' ? CalendarClock : a?.kind === 'agent' ? Bot : a?.kind === 'anon' ? VenetianMask : Heart
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
  return (
    <Link href={n.link} className={`notif-row${n.unread ? ' unread' : ''}`} data-kind={n.kind}>
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
        {n.excerpt && <span className="notif-excerpt">{n.excerpt}</span>}
        <time className="notif-time" dateTime={new Date(n.createdAt).toISOString()}>{relativeLabel(n.createdAt, locale)}</time>
      </span>
      {n.unread && <span className="notif-dot" aria-label="new" />}
    </Link>
  )
}
