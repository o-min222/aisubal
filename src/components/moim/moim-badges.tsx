import Link from 'next/link'
import { Globe, MapPin, Lock } from 'lucide-react'
import type { MoimGroupRef } from '@/lib/data/moim'
import { RSVP_LABEL, type RsvpStatus } from '@/lib/moim-rules'
import { T } from '@/i18n/t'
import { GroupAvatar } from '@/components/groups/group-avatar'

export function GroupBadge({ group, link = true }: { group: MoimGroupRef; link?: boolean }) {
  const inner = (
    <>
      <GroupAvatar name={group.name} size={14} />
      {group.name}
    </>
  )
  const style = { background: 'var(--c-f3f0ff)', color: 'var(--c-5b3fc4)' }
  return link ? (
    <Link href={`/groups/${group.slug}`} className="group-badge inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-semibold leading-[22px] whitespace-nowrap" style={style}>
      {inner}
    </Link>
  ) : (
    <span className="group-badge inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-semibold leading-[22px] whitespace-nowrap" style={style}>
      {inner}
    </span>
  )
}

export function ModeBadge({ mode }: { mode: 'online' | 'offline' }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-medium leading-[22px]" style={{ background: 'var(--n-f2f2f2)', color: 'var(--n-444)' }}>
      {mode === 'online' ? <Globe className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
      {mode === 'online' ? <T>온라인</T> : <T>오프라인</T>}
    </span>
  )
}

export function MembersOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-medium leading-[22px]" style={{ background: 'var(--c-fff4e5)', color: 'var(--c-9a5b00)' }}>
      <Lock className="w-3 h-3" /> <T>그룹 멤버만</T>
    </span>
  )
}

const RSVP_TONE: Record<RsvpStatus, { bg: string; fg: string }> = {
  confirmed: { bg: 'var(--c-e8f5ee)', fg: 'var(--c-1f7a4d)' },
  pending: { bg: 'var(--c-fff4e5)', fg: 'var(--c-9a5b00)' },
  waitlisted: { bg: 'var(--c-eef1fb)', fg: 'var(--c-3446a8)' },
  rejected: { bg: 'var(--c-fdecec)', fg: 'var(--c-b42318)' },
  cancelled: { bg: 'var(--n-f2f2f2)', fg: 'var(--n-777)' },
}

export function RsvpBadge({ status, position }: { status: RsvpStatus; position?: number | null }) {
  const t = RSVP_TONE[status]
  return (
    <span className="inline-flex items-center rounded-full px-2 text-[12px] font-semibold leading-[22px] whitespace-nowrap" style={{ background: t.bg, color: t.fg }}>
      <T>{RSVP_LABEL[status]}</T>
      {status === 'waitlisted' && position ? <> <T s="{n}번째" vars={{ n: position }} /></> : ''}
    </span>
  )
}

export function CapacityBar({ confirmed, capacity }: { confirmed: number; capacity: number }) {
  const pct = Math.min(100, Math.round((confirmed / Math.max(capacity, 1)) * 100))
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span aria-hidden style={{ width: 64, height: 6, borderRadius: 99, background: 'var(--n-eee)', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--c-e5484d)' : 'var(--n-111)' }} />
      </span>
      <span className="tabular-nums text-[12.5px]" style={{ color: 'var(--n-555)' }}>
        <T s="{n}/{cap}명" vars={{ n: confirmed, cap: capacity }} />
        {pct >= 100 ? <> · <T>마감</T></> : ''}
      </span>
    </span>
  )
}
