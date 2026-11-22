import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { CalendarDays, ChevronLeft, ExternalLink, Globe, Lock, MapPin, Megaphone, Pencil, Users } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getMoim } from '@/lib/data/moim'
import { kstDateTime, kstTime } from '@/lib/kst'
import { UserAvatar } from '@/components/user-avatar'
import { CapacityBar, GroupBadge, MembersOnlyBadge, ModeBadge } from '@/components/moim/moim-badges'
import { MoimApplyPanel } from '@/components/moim/moim-apply-panel'
import { MoimHostPanel } from '@/components/moim/moim-host-panel'

export default async function MoimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const m = await getMoim(state.member.id, id).catch(() => null)
  if (!m) notFound()
  const sameDay = m.endsAt && new Date(m.endsAt).toDateString() === new Date(m.startsAt).toDateString()

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-1">
        <Link href="/moim" className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[#f2f2f2]" aria-label="모임 목록">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <span className="text-sm text-[#666]">모임</span>
        {m.canManage && (
          <Link href={`/moim/${m.id}/edit`} className="ml-auto btn btn-secondary btn-sm min-h-[40px] rounded-full">
            <Pencil className="w-3.5 h-3.5" /> 수정
          </Link>
        )}
      </div>

      <article className="card p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {m.group && <GroupBadge group={m.group} />}
          <ModeBadge mode={m.mode} />
          {m.membersOnly && <MembersOnlyBadge />}
          <span className="text-[12px] text-[#777]">{m.requiresApproval ? '호스트 승인제' : '선착순'}</span>
          {m.status !== 'open' && (
            <span className="text-[12px] font-semibold" style={{ color: m.status === 'cancelled' ? '#b42318' : '#777' }}>
              {m.status === 'cancelled' ? '취소된 모임' : m.status === 'closed' ? '신청 마감' : '지난 모임'}
            </span>
          )}
        </div>
        <h1 className="text-[22px] font-bold leading-snug" style={{ color: '#111' }}>
          {m.title}
        </h1>
        <ul className="space-y-1.5 text-[14px]" style={{ color: '#333' }}>
          <li className="flex items-start gap-2">
            <CalendarDays className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#777]" />
            <span>
              {kstDateTime(m.startsAt)}
              {m.endsAt && ` – ${sameDay ? kstTime(m.endsAt) : kstDateTime(m.endsAt)}`} <span className="text-[#999]">(한국 시간)</span>
              {m.applyDeadline && <span className="block text-[12.5px] text-[#777]">신청 마감 {kstDateTime(m.applyDeadline)}</span>}
            </span>
          </li>
          <li className="flex items-start gap-2">
            {m.mode === 'online' ? <Globe className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#777]" /> : <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#777]" />}
            <span>{m.mode === 'online' ? '온라인' : m.venueName || '지역 미정'}</span>
          </li>
          <li className="flex items-center gap-2">
            <Users className="w-4 h-4 flex-shrink-0 text-[#777]" />
            <CapacityBar confirmed={m.confirmed} capacity={m.capacity} />
            {m.waitlisted > 0 && <span className="text-[12.5px] text-[#3446a8]">대기 {m.waitlisted}명</span>}
          </li>
        </ul>

        {/* Exact place / links: only managers and confirmed attendees get these from the server. */}
        {m.private ? (
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: '#e8f5ee' }}>
            <p className="text-[12px] font-semibold" style={{ color: '#1f7a4d' }}>
              참석 확정자에게만 보이는 정보
            </p>
            {m.mode === 'offline' ? (
              <>
                <p className="text-[14px]" style={{ color: '#111' }}>
                  {m.private.venueAddress || '호스트가 아직 정확한 주소를 적지 않았어요.'}
                </p>
                {m.private.mapUrl && (
                  <a href={m.private.mapUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[13px] font-semibold underline" style={{ color: '#1f7a4d' }}>
                    지도 열기 <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </>
            ) : m.private.meetingUrl ? (
              <a href={m.private.meetingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[14px] font-semibold underline break-all" style={{ color: '#1f7a4d' }}>
                {m.private.meetingUrl} <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              </a>
            ) : (
              <p className="text-[14px]">호스트가 곧 링크를 공유할 예정이에요.</p>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: '#f6f6f4', color: '#666' }}>
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            {m.mode === 'online' ? '온라인 링크' : '정확한 장소와 지도'}는 참석이 확정되면 여기에 보여요.
          </p>
        )}

        <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ color: '#222' }}>
          {m.description}
        </div>
        {m.feeNote && <p className="text-[13px] text-[#555]">참가비·준비물: {m.feeNote}</p>}

        <div className="flex items-center gap-2 pt-1">
          <UserAvatar id={m.host.id} name={m.host.name} avatarUrl={m.host.avatarUrl} size="sm" />
          <span className="text-[13px] text-[#555]">
            호스트{' '}
            {m.host.kind === 'real' ? (
              <Link href={`/members/${m.host.id}`} className="font-semibold hover:underline" style={{ color: '#111' }}>
                {m.host.name}
              </Link>
            ) : (
              <b style={{ color: '#111' }}>{m.host.name}</b>
            )}
            {m.group && ` · ${m.group.name} 그룹 모임`}
          </span>
        </div>
      </article>

      <MoimApplyPanel moim={m} />

      {m.canManage && m.applicants && <MoimHostPanel moim={m} />}

      {m.announcements.length > 0 && (
        <section className="card p-4 space-y-2" aria-label="공지">
          <h2 className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: '#111' }}>
            <Megaphone className="w-4 h-4" /> 공지
          </h2>
          {m.announcements.map((a) => (
            <div key={a.id} className="rounded-xl p-3" style={{ background: '#fafafa' }}>
              <p className="text-[14px] whitespace-pre-wrap" style={{ color: '#222' }}>
                {a.body}
              </p>
              <p className="text-[11.5px] text-[#999] mt-1">{kstDateTime(a.createdAt)}</p>
            </div>
          ))}
        </section>
      )}

      <section className="card p-4" aria-label="참석자">
        <h2 className="text-[15px] font-bold mb-2" style={{ color: '#111' }}>
          참석 확정 <span className="tabular-nums text-[#999] font-normal">{m.confirmed}</span>
        </h2>
        {m.attendees === null ? (
          <p className="text-[13px] text-[#888]">참석 확정자와 호스트만 명단을 볼 수 있어요.</p>
        ) : m.attendees.length === 0 ? (
          <p className="text-[13px] text-[#888]">아직 확정된 참석자가 없어요.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {m.attendees.map((a) => (
              <li key={a.memberId}>
                <Link href={a.kind === 'real' ? `/members/${a.id}` : '#'} className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1" style={{ background: '#f6f6f4' }}>
                  <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                  <span className="text-[13px]" style={{ color: '#111' }}>
                    {a.name}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
