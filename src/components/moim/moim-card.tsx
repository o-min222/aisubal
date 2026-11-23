import Link from 'next/link'
import type { Moim } from '@/lib/data/moim'
import { KstDate } from '@/components/kst-date'
import { MoimMeta } from './moim-meta'
import { CapacityBar, GroupBadge, MembersOnlyBadge, ModeBadge, RsvpBadge } from './moim-badges'
import { T } from '@/i18n/t'

export function MoimCard({ moim: m, showGroup = true }: { moim: Moim; showGroup?: boolean }) {
  const cancelled = m.status === 'cancelled'
  return (
    <article className="moim-card card p-3.5 flex gap-3" style={cancelled ? { opacity: 0.6 } : undefined}>
      <div
        aria-hidden
        className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl"
        style={{ width: 56, height: 60, background: 'var(--n-111)', color: 'var(--n-fff)' }}
      >
        <span className="text-[11px] opacity-80"><KstDate iso={m.startsAt} part="month" /></span>
        <span className="text-[20px] font-bold leading-none"><KstDate iso={m.startsAt} part="day" /></span>
        <span className="text-[10.5px] opacity-80"><KstDate iso={m.startsAt} part="weekday" /></span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          {showGroup && m.group && <GroupBadge group={m.group} link={false} />}
          <ModeBadge mode={m.mode} />
          {m.membersOnly && <MembersOnlyBadge />}
          {m.requiresApproval && <span className="text-[11.5px] text-n-777"><T>승인제</T></span>}
          {cancelled && <span className="text-[11.5px] font-semibold text-c-b42318"><T>취소됨</T></span>}
        </div>
        <Link href={`/moim/${m.id}`} className="block">
          <h3 className="font-semibold text-[15.5px] leading-snug" style={{ color: 'var(--n-111)' }}>
            {m.title}
          </h3>
        </Link>
        <MoimMeta m={m} className="!text-[12.5px] mt-0.5" />
        <p className="text-[12px] mt-0.5 truncate text-n-888">
          <T s="호스트 {name}" vars={{ name: m.host.name }} />
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <CapacityBar confirmed={m.confirmed} capacity={m.capacity} />
          {m.waitlisted > 0 && <span className="text-[12px] text-c-3446a8"><T s="대기 {n}" vars={{ n: m.waitlisted }} /></span>}
          {m.canManage && m.pending > 0 && <span className="text-[12px] font-semibold text-c-9a5b00"><T s="승인 대기 {n}" vars={{ n: m.pending }} /></span>}
          {m.myRsvp && <RsvpBadge status={m.myRsvp.status} position={m.myRsvp.position} />}
          {m.canManage && <span className="text-[12px] font-semibold text-n-111">{m.isHost ? <T>내가 호스트</T> : <T>운영 중</T>}</span>}
        </div>
      </div>
    </article>
  )
}
