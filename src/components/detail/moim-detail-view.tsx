import Link from 'next/link'
import { ArchiveButton } from '@/components/archive/archive-button'
import { CalendarDays, ChevronLeft, ExternalLink, Globe, Lock, MapPin, Megaphone, Pencil, Users } from 'lucide-react'
import type { MoimDetail } from '@/lib/data/moim'
import { KstDate } from '@/components/kst-date'
import { UserAvatar } from '@/components/user-avatar'
import { CapacityBar, GroupBadge, MembersOnlyBadge, ModeBadge } from '@/components/moim/moim-badges'
import { MoimApplyPanel } from '@/components/moim/moim-apply-panel'
import { MoimHostPanel } from '@/components/moim/moim-host-panel'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** 모임 detail. Used by /moim/[id] and the 모임 reading pane. */
export async function MoimDetailView({ m, variant = 'page' }: { m: MoimDetail; variant?: 'page' | 'pane' }) {
  const st = await getT()
  const sameDay = m.endsAt && new Date(m.endsAt).toDateString() === new Date(m.startsAt).toDateString()

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-1">
        {variant === 'page' && (
        <Link href="/moim" className="tap-target inline-flex items-center justify-center rounded-full hover:bg-n-f2f2f2" aria-label={st('모임 목록')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        )}
        {variant === 'page' && <span className="text-sm text-n-666"><T>모임</T></span>}
        {m.canManage && (
          <Link href={`/moim/${m.id}/edit`} className="ml-auto btn btn-secondary btn-sm min-h-[40px] rounded-full">
            <Pencil className="w-3.5 h-3.5" /> <T>수정</T>
          </Link>
        )}
      </div>

      <article className="card p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {m.group && <GroupBadge group={m.group} />}
          <ModeBadge mode={m.mode} />
          {m.membersOnly && <MembersOnlyBadge />}
          <span className="text-[12px] text-n-777">{m.requiresApproval ? <T>호스트 승인제</T> : <T>선착순</T>}</span>
          {m.status !== 'open' && (
            <span className="text-[12px] font-semibold" style={{ color: m.status === 'cancelled' ? 'var(--c-b42318)' : 'var(--n-777)' }}>
              {m.status === 'cancelled' ? <T>취소된 모임</T> : m.status === 'closed' ? <T>신청 마감</T> : <T>지난 모임</T>}
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] font-bold leading-snug min-w-0" style={{ color: 'var(--n-111)' }}>
            {m.title}
          </h1>
          <ArchiveButton kind="moim" refId={m.id} variant="pill" className="flex-shrink-0" hint={{ title: m.title, url: `/moim/${m.id}` }} />
        </div>
        <ul className="space-y-1.5 text-[14px]" style={{ color: 'var(--n-333)' }}>
          <li className="flex items-start gap-2">
            <CalendarDays className="w-4 h-4 mt-0.5 flex-shrink-0 text-n-777" />
            <span>
              <KstDate iso={m.startsAt} />
              {m.endsAt && <> – {sameDay ? <KstDate iso={m.endsAt} part="time" /> : <KstDate iso={m.endsAt} />}</>} <span className="text-n-999"><T>(한국 시간)</T></span>
              {m.applyDeadline && <span className="block text-[12.5px] text-n-777">신청 마감 <KstDate iso={m.applyDeadline} /></span>}
            </span>
          </li>
          <li className="flex items-start gap-2">
            {m.mode === 'online' ? <Globe className="w-4 h-4 mt-0.5 flex-shrink-0 text-n-777" /> : <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0 text-n-777" />}
            <span>{m.mode === 'online' ? <T>온라인</T> : m.venueName || <T>지역 미정</T>}</span>
          </li>
          <li className="flex items-center gap-2">
            <Users className="w-4 h-4 flex-shrink-0 text-n-777" />
            <CapacityBar confirmed={m.confirmed} capacity={m.capacity} />
            {m.waitlisted > 0 && <span className="text-[12.5px] text-c-3446a8"><T s="대기 {n}명" vars={{ n: m.waitlisted }} /></span>}
          </li>
        </ul>

        {/* Exact place / links: only managers and confirmed attendees get these from the server. */}
        {m.private ? (
          <div className="rounded-xl p-3 space-y-1.5" style={{ background: 'var(--c-e8f5ee)' }}>
            <p className="text-[12px] font-semibold" style={{ color: 'var(--c-1f7a4d)' }}>
              <T>참석 확정자에게만 보이는 정보</T>
            </p>
            {m.mode === 'offline' ? (
              <>
                <p className="text-[14px]" style={{ color: 'var(--n-111)' }}>
                  {m.private.venueAddress || <T>호스트가 아직 정확한 주소를 적지 않았어요.</T>}
                </p>
                {m.private.mapUrl && (
                  <a href={m.private.mapUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[13px] font-semibold underline" style={{ color: 'var(--c-1f7a4d)' }}>
                    <T>지도 열기</T> <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </>
            ) : m.private.meetingUrl ? (
              <a href={m.private.meetingUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-[14px] font-semibold underline break-all" style={{ color: 'var(--c-1f7a4d)' }}>
                {m.private.meetingUrl} <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              </a>
            ) : (
              <p className="text-[14px]"><T>호스트가 곧 링크를 공유할 예정이에요.</T></p>
            )}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: 'var(--n-f6f6f4)', color: 'var(--n-666)' }}>
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            {m.mode === 'online' ? <T>온라인 링크</T> : <T>정확한 장소와 지도</T>}는 참석이 확정되면 여기에 보여요.
          </p>
        )}

        <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--n-222)' }}>
          {m.description}
        </div>
        {m.feeNote && <p className="text-[13px] text-n-555"><T s="참가비·준비물: {feeNote}" vars={{ feeNote: m.feeNote }} /></p>}

        <div className="flex items-center gap-2 pt-1">
          <UserAvatar id={m.host.id} name={m.host.name} avatarUrl={m.host.avatarUrl} size="sm" />
          <span className="text-[13px] text-n-555"><T s="호스트 {v} {v2}" vars={{ v: m.host.kind === 'real' ? (
              <Link href={`/members/${m.host.id}`} className="font-semibold hover:underline" style={{ color: 'var(--n-111)' }}>
                {m.host.name}
              </Link>
            ) : (
              <b style={{ color: 'var(--n-111)' }}>{m.host.name}</b>
            ), v2: m.group && st(' · {name} 그룹 모임', { name: m.group.name }) }} /></span>
        </div>
      </article>

      <MoimApplyPanel moim={m} />

      {m.canManage && m.applicants && <MoimHostPanel moim={m} />}

      {m.announcements.length > 0 && (
        <section className="card p-4 space-y-2" aria-label={st('공지')}>
          <h2 className="flex items-center gap-1.5 text-[15px] font-bold" style={{ color: 'var(--n-111)' }}>
            <Megaphone className="w-4 h-4" /> <T>공지</T>
          </h2>
          {m.announcements.map((a) => (
            <div key={a.id} className="rounded-xl p-3" style={{ background: 'var(--n-fafafa)' }}>
              <p className="text-[14px] whitespace-pre-wrap" style={{ color: 'var(--n-222)' }}>
                {a.body}
              </p>
              <p className="text-[11.5px] text-n-999 mt-1"><KstDate iso={a.createdAt} /></p>
            </div>
          ))}
        </section>
      )}

      <section className="card p-4" aria-label={st('참석자')}>
        <h2 className="text-[15px] font-bold mb-2" style={{ color: 'var(--n-111)' }}>
          <T>참석 확정</T> <span className="tabular-nums text-n-999 font-normal">{m.confirmed}</span>
        </h2>
        {m.attendees === null ? (
          <p className="text-[13px] text-n-888"><T>참석 확정자와 호스트만 명단을 볼 수 있어요.</T></p>
        ) : m.attendees.length === 0 ? (
          <p className="text-[13px] text-n-888"><T>아직 확정된 참석자가 없어요.</T></p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {m.attendees.map((a) => (
              <li key={a.memberId}>
                <Link href={a.kind === 'real' ? `/members/${a.id}` : '#'} className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-3 py-1" style={{ background: 'var(--n-f6f6f4)' }}>
                  <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
                  <span className="text-[13px]" style={{ color: 'var(--n-111)' }}>
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
