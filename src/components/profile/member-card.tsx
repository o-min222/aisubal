'use client'

import { ArchiveButton } from '@/components/archive/archive-button'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import Link from 'next/link'
import { useState } from 'react'
import { ExternalLink, Lock, Users } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { ServiceChip } from '@/components/service-chip'
import { RelativeTime } from '@/components/relative-time'
import { FollowButton } from '@/components/social/follow-button'
import { FriendButton } from '@/components/social/friend-button'
import type { MemberCardData } from '@/lib/data/member-card'
import { LINK_VISIBILITY, type LinkVisibility } from '@/lib/profile-rules'
import { STACK_GROUP_LABEL, chipOverflow, platformOf, type MemberAgent, type StackGroup, type StackGroupData } from '@/lib/profile-stack'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { dedupeParts } from '@/lib/dedupe-parts'

function VisNote({ vis }: { vis: LinkVisibility | null }) {
  if (!vis || vis === 'members') return null
  return (
    <span className="mc-vis" title={tx(LINK_VISIBILITY.find((v) => v.id === vis)?.hint ?? '')}>
      {vis === 'private' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
      <T>{LINK_VISIBILITY.find((v) => v.id === vis)?.label ?? ''}</T>
    </span>
  )
}

/** Compact icon chips with '+N' overflow (tap +N to expand in place). */
export function StackChips({ group, data, max = 6 }: { group: StackGroup; data: StackGroupData; max?: number }) {
  const [all, setAll] = useState(false)
  if (!data || data.items.length === 0) return null
  const { shown, more } = all ? { shown: data.items, more: 0 } : chipOverflow(data.items, max)
  return (
    <div className="mc-group">
      <div className="mc-group-label">
        <T>{STACK_GROUP_LABEL[group]}</T>
        <VisNote vis={data.visibility} />
      </div>
      <ul className="mc-chips" aria-label={tx(STACK_GROUP_LABEL[group])}>
        {shown.map((it, i) => (
          <li key={`${it.label}-${i}`}>
            <ServiceChip
              label={it.label}
              iconUrl={it.entry?.iconUrl}
              href={it.entry ? `/gallery/${it.entry.slug}` : undefined}
              title={it.entry ? tx('{name} — 갤러리에서 보기', { name: it.label }) : it.label}
            />
          </li>
        ))}
        {more > 0 && (
          <li>
            <button type="button" className="mc-chip mc-more" onClick={() => setAll(true)} aria-label={tx('{more}개 더 보기', { more })}>
              +{more}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}


function AgentRow({ a, isMe }: { a: MemberAgent; isMe: boolean }) {
  const p = platformOf(a.platform)
  const inner = (
    <>
      <AgentAvatar name={a.name} model={a.model || p.label} avatarUrl={a.connected?.avatarUrl ?? null} size={28} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="mc-agent-name truncate">{a.name}</span>
          {a.connected && <span className="mc-connected"><T>연결됨</T></span>}
          {isMe && <VisNote vis={a.visibility} />}
        </span>
        <span className="mc-agent-meta truncate">
          {dedupeParts([p.label, a.model, a.role])}
          {a.connected?.lastActiveAt && (
            <>
              {' · '}
              <RelativeTime date={a.connected.lastActiveAt} /> <T>활동</T>
            </>
          )}
        </span>
      </span>
      {!a.connected && a.url && <ExternalLink className="w-3.5 h-3.5 text-n-aaa flex-shrink-0" aria-hidden />}
    </>
  )
  if (a.connected) return <Link href={a.connected.href} className="mc-agent mc-agent-link">{inner}</Link>
  if (a.url) return <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="mc-agent mc-agent-link">{inner}</a>
  return <div className="mc-agent">{inner}</div>
}

export function AgentList({ agents, isMe, max = 3, title = tx('내 에이전트') }: { agents: MemberAgent[]; isMe: boolean; max?: number; title?: string }) {
  const [all, setAll] = useState(false)
  if (!agents.length) return null
  const { shown, more } = all ? { shown: agents, more: 0 } : chipOverflow(agents, max)
  return (
    <div className="mc-group">
      <div className="mc-group-label"><T>{title}</T></div>
      <ul className="mc-agents">
        {shown.map((a) => (
          <li key={a.id}>
            <AgentRow a={a} isMe={isMe} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button type="button" className="mc-more-row" onClick={() => setAll(true)}>
          <T s="에이전트 +{n}" vars={{ n: more }} />
        </button>
      )}
    </div>
  )
}

/**
 * Unified profile card: the left '내 프로필 카드' and the card shown when
 * clicking another member. Only the actions differ (편집 vs 팔로우/친구).
 */
export function MemberCard({ data, variant = 'side' }: { data: MemberCardData; variant?: 'side' | 'peek' }) {
  const profileHref = data.isMe ? '/me' : `/members/${data.id}`
  const s = data.stack
  const chipMax = 6
  return (
    <section className={`profile-card member-card member-card-${variant}`} aria-label={tx('{displayName} 프로필 카드', { displayName: data.displayName })}>
      <div className="profile-card-cover" aria-hidden />
      <div className="px-3 pb-3 -mt-7">
        <div className="flex items-end justify-between gap-2">
          <Link href={profileHref} className="inline-block rounded-full ring-4 ring-n-fff" aria-label={tx('{displayName} 프로필', { displayName: data.displayName })}>
            <UserAvatar id={data.id} name={data.displayName} avatarUrl={data.avatarUrl} size="lg" />
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {!data.isMe && (
              data.relation && (
                <>
                  <ArchiveButton kind="member" refId={data.id} hint={{ title: data.displayName, excerpt: data.bio ?? undefined, url: `/members/${data.id}`, author: data.handle ? `@${data.handle}` : undefined }} />
                  <FollowButton memberId={data.id} initialFollowing={data.relation.iFollow} variant="chip" refresh={false} />
                  <FriendButton memberId={data.id} initialState={data.relation.friend} compact />
                </>
              )
            )}
          </div>
        </div>
        <Link href={profileHref} className="block mt-2 min-w-0 group">
          <span className="pc-name block font-semibold text-n-111 truncate group-hover:underline">{data.displayName}</span>
          {data.handle && <span className="block text-xs text-n-888 truncate">@{data.handle}</span>}
        </Link>
        {data.bio && <p className="text-xs text-n-666 mt-1 line-clamp-2">{data.bio}</p>}
        {s && (
          <div className="mc-body">
            <StackChips group="ai" data={s.ai && { ...s.ai, visibility: null }} max={chipMax} />
            <StackChips group="subs" data={s.subs && { ...s.subs, visibility: null }} max={chipMax} />
            <StackChips group="skills" data={s.skills && { ...s.skills, visibility: null }} max={chipMax} />
            <AgentList agents={s.agents} isMe={false} max={variant === 'side' ? 2 : 3} title={tx('에이전트')} />
          </div>
        )}
      </div>
      <dl className="profile-stats">
        {data.stats.map((st) => {
          const body = (
            <>
              <dt><T>{st.label}</T></dt>
              <dd>{st.value ?? '–'}</dd>
            </>
          )
          if (st.href && st.sub)
            return (
              <div key={st.label} className="profile-stat-cell">
                <Link href={st.href}>{body}</Link>
                <Link href={st.sub.href} className="profile-stat-sub">
                  <T>{st.sub.label}</T> ›
                </Link>
              </div>
            )
          return st.href ? (
            <Link key={st.label} href={st.href}>
              {body}
            </Link>
          ) : (
            <div key={st.label}>{body}</div>
          )
        })}
      </dl>
    </section>
  )
}
