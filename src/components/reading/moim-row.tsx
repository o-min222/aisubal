import { Lock, MapPin, Users } from 'lucide-react'
import type { Moim } from '@/lib/data/moim'
import { kstDateTime, kstDayBadge } from '@/lib/kst'
import { ModeBadge, RsvpBadge } from '@/components/moim/moim-badges'
import { CompactRow } from './compact-row'

/** Compact 모임 row: date tile, title, when/where, capacity and my RSVP. */
export function MoimRow({ moim: m, href, active }: { moim: Moim; href: string; active?: boolean }) {
  const d = kstDayBadge(m.startsAt)
  const full = m.capacity > 0 && m.confirmed >= m.capacity
  return (
    <CompactRow
      href={href}
      active={active}
      leading={
        <span className="moim-date-tile" aria-hidden>
          <small>{d.month}</small>
          <b>{d.day}</b>
          <small>{d.weekday}</small>
        </span>
      }
      title={m.title}
      badge={m.myRsvp ? <RsvpBadge status={m.myRsvp.status} position={m.myRsvp.position} /> : m.status === 'cancelled' ? <span className="crow-chip">취소됨</span> : null}
      preview={
        <>
          {kstDateTime(m.startsAt)}
          {m.mode === 'offline' && m.venueName ? ` · ${m.venueName}` : ''}
        </>
      }
      meta={
        <>
          <ModeBadge mode={m.mode} />
          <span>
            <Users className="w-3 h-3" /> {m.confirmed}/{m.capacity || '∞'}
            {full && ' · 마감'}
            {m.waitlisted > 0 && ` · 대기 ${m.waitlisted}`}
          </span>
          {m.membersOnly && (
            <span>
              <Lock className="w-3 h-3" /> 그룹 전용
            </span>
          )}
          {m.group ? (
            <span>
              {m.group.emoji ?? '👥'} {m.group.name}
            </span>
          ) : (
            <span>{m.host.name}</span>
          )}
          {m.mode === 'offline' && !m.venueName && (
            <span>
              <MapPin className="w-3 h-3" /> 장소는 확정 후 공개
            </span>
          )}
        </>
      }
    />
  )
}
