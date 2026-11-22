'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ExternalLink, Lock, Pencil, Users } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { FollowButton } from '@/components/social/follow-button'
import { FriendButton } from '@/components/social/friend-button'
import type { MemberCardData } from '@/lib/data/member-card'
import { LINK_VISIBILITY, type LinkVisibility } from '@/lib/profile-rules'
import { STACK_GROUP_LABEL, chipOverflow, platformOf, type MemberAgent, type StackGroup, type StackGroupData, type StackItem } from '@/lib/profile-stack'

const HUES = ['#d97757', '#10a37f', '#4f7cff', '#111111', '#8b5cf6', '#e5484d', '#0f766e', '#c2410c']
const hue = (s: string) => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % HUES.length]

function ChipIcon({ item }: { item: StackItem }) {
  const url = item.entry?.iconUrl
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="mc-chip-icon" style={{ objectFit: 'cover' }} />
  }
  return (
    <span className="mc-chip-icon" style={{ background: hue(item.label) }} aria-hidden>
      {item.label.charAt(0).toUpperCase()}
    </span>
  )
}

function VisNote({ vis }: { vis: LinkVisibility | null }) {
  if (!vis || vis === 'members') return null
  return (
    <span className="mc-vis" title={LINK_VISIBILITY.find((v) => v.id === vis)?.hint}>
      {vis === 'private' ? <Lock className="w-3 h-3" /> : <Users className="w-3 h-3" />}
      {LINK_VISIBILITY.find((v) => v.id === vis)?.label}
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
        {STACK_GROUP_LABEL[group]}
        <VisNote vis={data.visibility} />
      </div>
      <ul className="mc-chips" aria-label={STACK_GROUP_LABEL[group]}>
        {shown.map((it, i) => (
          <li key={`${it.label}-${i}`}>
            {it.entry ? (
              <Link href={`/tools/${it.entry.slug}`} className="mc-chip mc-chip-link" title={`${it.label} — 툴 보기`}>
                <ChipIcon item={it} />
                <span className="truncate">{it.label}</span>
              </Link>
            ) : (
              <span className="mc-chip" title={it.label}>
                <ChipIcon item={it} />
                <span className="truncate">{it.label}</span>
              </span>
            )}
          </li>
        ))}
        {more > 0 && (
          <li>
            <button type="button" className="mc-chip mc-more" onClick={() => setAll(true)} aria-label={`${more}개 더 보기`}>
              +{more}
            </button>
          </li>
        )}
      </ul>
    </div>
  )
}

function PlatformIcon({ platform }: { platform: string }) {
  const p = platformOf(platform)
  return (
    <span className="mc-agent-icon" style={{ background: p.color }} title={p.label} aria-hidden>
      {p.short}
    </span>
  )
}

function AgentRow({ a, isMe }: { a: MemberAgent; isMe: boolean }) {
  const p = platformOf(a.platform)
  const inner = (
    <>
      <PlatformIcon platform={a.platform} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="mc-agent-name truncate">{a.name}</span>
          {a.connected && <span className="mc-connected">연결됨</span>}
          {isMe && <VisNote vis={a.visibility} />}
        </span>
        <span className="mc-agent-meta truncate">
          {[p.label, a.model, a.role].filter(Boolean).join(' · ')}
          {a.connected?.lastActiveAt && (
            <>
              {' · '}
              <RelativeTime date={a.connected.lastActiveAt} /> 활동
            </>
          )}
        </span>
      </span>
      {!a.connected && a.url && <ExternalLink className="w-3.5 h-3.5 text-[#aaa] flex-shrink-0" aria-hidden />}
    </>
  )
  if (a.connected) return <Link href={a.connected.href} className="mc-agent mc-agent-link">{inner}</Link>
  if (a.url) return <a href={a.url} target="_blank" rel="noopener noreferrer nofollow" className="mc-agent mc-agent-link">{inner}</a>
  return <div className="mc-agent">{inner}</div>
}

export function AgentList({ agents, isMe, max = 3, title = '내 에이전트' }: { agents: MemberAgent[]; isMe: boolean; max?: number; title?: string }) {
  const [all, setAll] = useState(false)
  if (!agents.length) return null
  const { shown, more } = all ? { shown: agents, more: 0 } : chipOverflow(agents, max)
  return (
    <div className="mc-group">
      <div className="mc-group-label">{title}</div>
      <ul className="mc-agents">
        {shown.map((a) => (
          <li key={a.id}>
            <AgentRow a={a} isMe={isMe} />
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button type="button" className="mc-more-row" onClick={() => setAll(true)}>
          에이전트 +{more}
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
  const chipMax = variant === 'side' ? 4 : 6
  const hasStack = s && (['ai', 'subs', 'skills'] as const).some((g) => (s[g]?.items.length ?? 0) > 0)
  const emptyOwn = data.isMe && !hasStack && !(s?.agents.length)
  return (
    <section className={`profile-card member-card member-card-${variant}`} aria-label={`${data.displayName} 프로필 카드`}>
      <div className="profile-card-cover" aria-hidden />
      <div className="px-3 pb-3 -mt-7">
        <div className="flex items-end justify-between gap-2">
          <Link href={profileHref} className="inline-block rounded-full ring-4 ring-white" aria-label={`${data.displayName} 프로필`}>
            <UserAvatar id={data.id} name={data.displayName} avatarUrl={data.avatarUrl} size="lg" />
          </Link>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {data.isMe ? (
              <Link href="/settings/profile" className="btn btn-secondary btn-sm rounded-full min-h-[34px] inline-flex items-center gap-1">
                <Pencil className="w-3.5 h-3.5" /> 프로필 편집
              </Link>
            ) : (
              data.relation && (
                <>
                  <FollowButton memberId={data.id} initialFollowing={data.relation.iFollow} variant="chip" refresh={false} />
                  <FriendButton memberId={data.id} initialState={data.relation.friend} compact />
                </>
              )
            )}
          </div>
        </div>
        <Link href={profileHref} className="block mt-2 min-w-0 group">
          <span className="pc-name block font-semibold text-[#111] truncate group-hover:underline">{data.displayName}</span>
          {data.handle && <span className="block text-xs text-[#888] truncate">@{data.handle}</span>}
        </Link>
        {data.isMe && data.nickname && <span className="block text-xs text-[#888] truncate">별명 @{data.nickname} (나만 보여요)</span>}
        {data.bio && <p className="text-xs text-[#666] mt-1 line-clamp-2">{data.bio}</p>}
        {s && (
          <div className="mc-body">
            <StackChips group="ai" data={s.ai} max={chipMax} />
            <StackChips group="subs" data={s.subs} max={chipMax} />
            <StackChips group="skills" data={s.skills} max={chipMax} />
            <AgentList agents={s.agents} isMe={data.isMe} max={variant === 'side' ? 2 : 3} title={data.isMe ? '내 에이전트' : '에이전트'} />
          </div>
        )}
        {emptyOwn && (
          <Link href="/settings/profile#stack" className="mc-empty">
            쓰는 AI·구독·에이전트를 추가해 보세요
          </Link>
        )}
      </div>
      <dl className="profile-stats">
        {data.stats.map((st) => {
          const body = (
            <>
              <dt>{st.label}</dt>
              <dd>{st.value ?? '–'}</dd>
            </>
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
