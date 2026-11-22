import Link from 'next/link'
import type { Moim } from '@/lib/data/moim'
import { kstDayBadge, kstDateTime } from '@/lib/kst'
import { CapacityBar, GroupBadge, MembersOnlyBadge, ModeBadge, RsvpBadge } from './moim-badges'

export function MoimCard({ moim: m, showGroup = true }: { moim: Moim; showGroup?: boolean }) {
  const d = kstDayBadge(m.startsAt)
  const cancelled = m.status === 'cancelled'
  return (
    <article className="moim-card card p-3.5 flex gap-3" style={cancelled ? { opacity: 0.6 } : undefined}>
      <div
        aria-hidden
        className="flex-shrink-0 flex flex-col items-center justify-center rounded-xl"
        style={{ width: 56, height: 60, background: '#111', color: '#fff' }}
      >
        <span className="text-[11px] opacity-80">{d.month}</span>
        <span className="text-[20px] font-bold leading-none">{d.day}</span>
        <span className="text-[10.5px] opacity-80">{d.weekday}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
          {showGroup && m.group && <GroupBadge group={m.group} link={false} />}
          <ModeBadge mode={m.mode} />
          {m.membersOnly && <MembersOnlyBadge />}
          {m.requiresApproval && <span className="text-[11.5px] text-[#777]">승인제</span>}
          {cancelled && <span className="text-[11.5px] font-semibold text-[#b42318]">취소됨</span>}
        </div>
        <Link href={`/moim/${m.id}`} className="block">
          <h3 className="font-semibold text-[15.5px] leading-snug hover:underline" style={{ color: '#111' }}>
            {m.title}
          </h3>
        </Link>
        <p className="text-[12.5px] mt-0.5 truncate" style={{ color: '#666' }}>
          {kstDateTime(m.startsAt)} · {m.mode === 'online' ? '온라인' : m.venueName || '장소는 확정 후 공개'} · 호스트 {m.host.name}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
          <CapacityBar confirmed={m.confirmed} capacity={m.capacity} />
          {m.waitlisted > 0 && <span className="text-[12px] text-[#3446a8]">대기 {m.waitlisted}</span>}
          {m.canManage && m.pending > 0 && <span className="text-[12px] font-semibold text-[#9a5b00]">승인 대기 {m.pending}</span>}
          {m.myRsvp && <RsvpBadge status={m.myRsvp.status} position={m.myRsvp.position} />}
          {m.canManage && <span className="text-[12px] font-semibold text-[#111]">{m.isHost ? '내가 호스트' : '운영 중'}</span>}
        </div>
      </div>
    </article>
  )
}
