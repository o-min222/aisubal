import { Lock, MapPin, Users } from 'lucide-react'
import type { Moim } from '@/lib/data/moim'
import { KstDate } from '@/components/kst-date'
import { ModeBadge, RsvpBadge } from '@/components/moim/moim-badges'
import { CompactRow } from './compact-row'
import { T } from '@/i18n/t'
import { GroupAvatar } from '@/components/groups/group-avatar'

/** Compact 모임 row: date tile, title, when/where, capacity and my RSVP. */
export function MoimRow({ moim: m, href, active }: { moim: Moim; href: string; active?: boolean }) {
  const full = m.capacity > 0 && m.confirmed >= m.capacity
  return (
    <CompactRow
      save={{ kind: 'moim', refId: m.id, hint: { title: m.title } }}
      href={href}
      active={active}
      leading={
        <span className="moim-date-tile" aria-hidden>
          <small><KstDate iso={m.startsAt} part="month" /></small>
          <b><KstDate iso={m.startsAt} part="day" /></b>
          <small><KstDate iso={m.startsAt} part="weekday" /></small>
        </span>
      }
      title={m.title}
      badge={m.myRsvp ? <RsvpBadge status={m.myRsvp.status} position={m.myRsvp.position} /> : m.status === 'cancelled' ? <span className="crow-chip"><T>취소됨</T></span> : null}
      preview={
        <>
          <KstDate iso={m.startsAt} />
          {m.mode === 'offline' && m.venueName ? ` · ${m.venueName}` : ''}
        </>
      }
      meta={
        <>
          <ModeBadge mode={m.mode} />
          <span>
            <Users className="w-3 h-3" /> {m.confirmed}/{m.capacity || '∞'}
            {full && <T> · 마감</T>}
            {m.waitlisted > 0 && <T s=" · 대기 {waitlisted}" vars={{ waitlisted: m.waitlisted }} />}
          </span>
          {m.membersOnly && (
            <span>
              <Lock className="w-3 h-3" /> <T>그룹 전용</T>
            </span>
          )}
          {m.group ? (
            <span>
              <GroupAvatar name={m.group.name} size={16} className="align-[-3px] mr-1" />{m.group.name}
            </span>
          ) : (
            <span>{m.host.name}</span>
          )}
          {m.mode === 'offline' && !m.venueName && (
            <span>
              <MapPin className="w-3 h-3" /> <T>장소는 확정 후 공개</T>
            </span>
          )}
        </>
      }
    />
  )
}
