import Link from 'next/link'
import { AtSign, Bot, Check, Heart, MessageCircle, PenLine, Sparkles, Ticket, UserPlus, Users, VenetianMask, Wrench, X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
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
  follow_post: PenLine,
  gallery_recommended: Sparkles,
  gallery_approved: Check,
  gallery_confirmed: Check,
  gallery_rejected: X,
} as const

function Avatar({ n }: { n: NotificationItem }) {
  const a = n.actor
  if (a?.kind === 'member' && a.id) return <UserAvatar id={a.id} name={a.name || '멤버'} avatarUrl={a.avatarUrl} size="md" />
  if (a?.kind === 'agent' && n.category !== 'gallery') return <AgentAvatar name={a.name || 'AI'} avatarUrl={a.avatarUrl} size={40} />
  const gallery = n.category === 'gallery' && a?.kind !== 'agent'
  const Icon = gallery ? Wrench : a?.kind === 'agent' ? Bot : a?.kind === 'anon' ? VenetianMask : Heart
  return (
    <span className={`notif-ava is-${gallery ? 'gallery' : (a?.kind ?? 'someone')}`} aria-hidden>
      <Icon className="w-5 h-5" />
    </span>
  )
}

/** One notification: who · what (one full sentence) · excerpt · when. The whole row is the link. */
export function NotificationRow({ n }: { n: NotificationItem }) {
  const s = notificationSentence(n)
  const KindIcon = KIND_ICON[n.kind]
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
          <T s={s.s} vars={{ name: <b>{s.name}</b>, n: s.n }} />
          {n.actor?.kind === 'agent' && <span className="agent-chip ml-1 align-middle">AI</span>}
        </span>
        {n.excerpt && <span className="notif-excerpt">{n.excerpt}</span>}
        <span className="notif-time"><RelativeTime date={n.createdAt} /></span>
      </span>
      {n.unread && <span className="notif-dot" aria-label="new" />}
    </Link>
  )
}
