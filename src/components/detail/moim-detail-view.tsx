import Link from 'next/link'
import { ArchiveButton } from '@/components/archive/archive-button'
import { ChevronLeft, ExternalLink, Lock, Megaphone, Pencil } from 'lucide-react'
import type { MoimDetail } from '@/lib/data/moim'
import { KstDate } from '@/components/kst-date'
import { GroupBadge, MembersOnlyBadge, ModeBadge } from '@/components/moim/moim-badges'
import { MoimApplyPanel } from '@/components/moim/moim-apply-panel'
import { MoimPeople } from '@/components/moim/moim-people'
import { MoimMeta } from '@/components/moim/moim-meta'
import { MoimThread } from '@/components/moim/moim-thread'
import { MoimCalendarMenu } from '@/components/moim/moim-calendar-menu'
import { moimToMine } from '@/lib/moim-calendar'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** 모임 detail. Used by /moim/[id] and the 모임 reading pane. */
export async function MoimDetailView({ m, variant = 'page', reply }: { m: MoimDetail; variant?: 'page' | 'pane'; reply?: string }) {
  const st = await getT()
  const sameDay = m.endsAt && new Date(m.endsAt).toDateString() === new Date(m.startsAt).toDateString()
  const p = m.private
  const hasPrivate = Boolean(p && (m.mode === 'offline' ? p.venueAddress || p.mapUrl : p.meetingUrl))

  return (
    <div className="space-y-3 pb-6">
      <div className="flex items-center gap-1">
        {variant === 'page' && (
        <Link href="/moim" className="tap-target inline-flex items-center justify-center rounded-full icon-btn" aria-label={st('모임 목록')}>
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
          {m.status !== 'past' && (
            <span className="ml-auto -my-1.5 -mr-1.5">
              <MoimCalendarMenu moim={moimToMine(m)} />
            </span>
          )}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[22px] font-bold leading-snug min-w-0" style={{ color: 'var(--n-111)' }}>
            {m.title}
          </h1>
          <ArchiveButton kind="moim" refId={m.id} variant="pill" className="flex-shrink-0" hint={{ title: m.title, url: `/moim/${m.id}` }} />
        </div>
        <MoimMeta m={m} className="!text-[14.5px]" />
        {(m.endsAt || m.applyDeadline) && (
          <p className="text-[12.5px] text-n-777 -mt-1.5">
            {m.endsAt && <><T>종료</T> {sameDay ? <KstDate iso={m.endsAt} part="time" /> : <KstDate iso={m.endsAt} />}</>}
            {m.endsAt && m.applyDeadline && ' · '}
            {m.applyDeadline && <><T>신청 마감</T> <KstDate iso={m.applyDeadline} /></>}
          </p>
        )}
        <MoimPeople m={m} />

        {/* Exact place / links: only managers and confirmed attendees get these from the server. */}
        {hasPrivate && m.private ? (
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
        ) : m.threadPostId ? null : (
          <p className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px]" style={{ background: 'var(--n-f6f6f4)', color: 'var(--n-666)' }}>
            <Lock className="w-3.5 h-3.5 flex-shrink-0" />
            {m.mode === 'online' ? <T>온라인 링크</T> : <T>정확한 장소와 지도</T>}는 참석이 확정되면 여기에 보여요.
          </p>
        )}

        {m.description && (
          <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--n-222)' }}>
            {m.description}
          </div>
        )}
        {m.feeNote && <p className="text-[13px] text-n-555"><T s="참가비·준비물: {feeNote}" vars={{ feeNote: m.feeNote }} /></p>}

      </article>

      <MoimApplyPanel moim={m} />

      {/* A29: the discussion comes right after "apply" — it's where the details get decided */}
      {m.threadPostId && <MoimThread moimId={m.id} postId={m.threadPostId} reply={reply} />}

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


    </div>
  )
}
