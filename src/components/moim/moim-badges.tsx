import Link from 'next/link'
import { Globe, MapPin, Lock } from 'lucide-react'
import type { MoimGroupRef } from '@/lib/data/moim'
import { RSVP_LABEL, type RsvpStatus } from '@/lib/moim-rules'

export function GroupBadge({ group, link = true }: { group: MoimGroupRef; link?: boolean }) {
  const inner = (
    <>
      <span aria-hidden>{group.emoji || '#'}</span>
      {group.name}
    </>
  )
  const style = { background: '#f3f0ff', color: '#5b3fc4' }
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
    <span className="inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-medium leading-[22px]" style={{ background: '#f2f2f2', color: '#444' }}>
      {mode === 'online' ? <Globe className="w-3 h-3" /> : <MapPin className="w-3 h-3" />}
      {mode === 'online' ? '온라인' : '오프라인'}
    </span>
  )
}

export function MembersOnlyBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 text-[12px] font-medium leading-[22px]" style={{ background: '#fff4e5', color: '#9a5b00' }}>
      <Lock className="w-3 h-3" /> 그룹 멤버만
    </span>
  )
}

const RSVP_TONE: Record<RsvpStatus, { bg: string; fg: string }> = {
  confirmed: { bg: '#e8f5ee', fg: '#1f7a4d' },
  pending: { bg: '#fff4e5', fg: '#9a5b00' },
  waitlisted: { bg: '#eef1fb', fg: '#3446a8' },
  rejected: { bg: '#fdecec', fg: '#b42318' },
  cancelled: { bg: '#f2f2f2', fg: '#777' },
}

export function RsvpBadge({ status, position }: { status: RsvpStatus; position?: number | null }) {
  const t = RSVP_TONE[status]
  return (
    <span className="inline-flex items-center rounded-full px-2 text-[12px] font-semibold leading-[22px] whitespace-nowrap" style={{ background: t.bg, color: t.fg }}>
      {RSVP_LABEL[status]}
      {status === 'waitlisted' && position ? ` ${position}번째` : ''}
    </span>
  )
}

export function CapacityBar({ confirmed, capacity }: { confirmed: number; capacity: number }) {
  const pct = Math.min(100, Math.round((confirmed / Math.max(capacity, 1)) * 100))
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span aria-hidden style={{ width: 64, height: 6, borderRadius: 99, background: '#eee', overflow: 'hidden', display: 'inline-block' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct >= 100 ? '#e5484d' : '#111' }} />
      </span>
      <span className="tabular-nums text-[12.5px]" style={{ color: '#555' }}>
        {confirmed}/{capacity}명{pct >= 100 ? ' · 마감' : ''}
      </span>
    </span>
  )
}
