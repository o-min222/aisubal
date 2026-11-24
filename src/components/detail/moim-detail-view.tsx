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
export async function MoimDetailView({ m, variant = 'page' }: { m: MoimDetail; variant?: 'page' | 'pane' }) {
  const st = await getT()
  const sameDay = m.endsAt && new Date(m.endsAt).toDateString() === new Date(m.startsAt).toDateString()
  const p = m.private
  const hasPrivate = Boolean(p && (m.mode === 'offline' ? p.venueAddress || p.mapUrl : p.meetingUrl))

  const statusLabel =
    m.status === 'cancelled' ? <T>취소된 모임</T> : m.status === 'closed' ? <T>신청 마감</T> : m.status === 'past' ? <T>지난 모임</T> : null

  // A52: one flat column (A49 style) — compact icon actions, a smaller title with the whole width,
  // the info, then 공지 and 신청, and the comments last with the reply box pinned while they're in view.
  return (
    <div className={variant === 'page' ? 'td td-page moim-flat moim-flat-page' : 'td moim-flat'}>
      <div className="moim-flat-bar">
        {variant === 'page' && (
          <Link href="/moim" className="td-back">
            <ChevronLeft className="w-4 h-4" /> <T>모임</T>
          </Link>
        )}
        <div className="moim-flat-actions">
          {m.status !== 'past' && <MoimCalendarMenu moim={moimToMine(m)} />}
          <ArchiveButton kind="moim" refId={m.id} hint={{ title: m.title, url: `/moim/${m.id}` }} />
          {m.canManage && (
            <Link href={`/moim/${m.id}/edit`} className="tap-target inline-flex items-center justify-center rounded-full icon-btn text-n-555" aria-label={st('수정')} title={st('수정')}>
              <Pencil className="w-4 h-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="moim-flat-badges">
        {m.group && <GroupBadge group={m.group} />}
        <ModeBadge mode={m.mode} />
        {m.membersOnly && <MembersOnlyBadge />}
        <span className="text-[12px] text-n-777">{m.requiresApproval ? <T>호스트 승인제</T> : <T>선착순</T>}</span>
        {statusLabel && (
          <span className="text-[12px] font-semibold" style={{ color: m.status === 'cancelled' ? 'var(--c-b42318)' : 'var(--n-777)' }}>
            {statusLabel}
          </span>
        )}
      </div>
      <h1 className="moim-flat-title">{m.title}</h1>
      <MoimMeta m={m} className="!text-[14px]" />
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
        <section className="td-sec">
          <p className="td-label" style={{ color: 'var(--c-1f7a4d)' }}>
            <Lock className="inline w-3 h-3 -mt-0.5 mr-1" aria-hidden />
            <T>참석 확정자에게만 보이는 정보</T>
          </p>
          {m.mode === 'offline' ? (
            <>
              <p className="text-[14px]" style={{ color: 'var(--n-111)' }}>
                {m.private.venueAddress || <T>호스트가 아직 정확한 주소를 적지 않았어요.</T>}
              </p>
              {m.private.mapUrl && (
                <a href={m.private.mapUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-link inline-flex items-center gap-1 text-[13px] self-start">
                  <T>지도 열기</T> <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </>
          ) : m.private.meetingUrl ? (
            <a href={m.private.meetingUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-link inline-flex items-center gap-1 text-[14px] break-all self-start">
              {m.private.meetingUrl} <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
            </a>
          ) : (
            <p className="text-[14px]"><T>호스트가 곧 링크를 공유할 예정이에요.</T></p>
          )}
        </section>
      ) : m.threadPostId ? null : (
        <p className="flex items-center gap-1.5 text-[12.5px] text-n-777">
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          {m.mode === 'online' ? <T>온라인 링크</T> : <T>정확한 장소와 지도</T>}는 참석이 확정되면 여기에 보여요.
        </p>
      )}

      {(m.description || m.feeNote) && (
        <section className="td-sec">
          {m.description && (
            <div className="text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--n-222)' }}>
              {m.description}
            </div>
          )}
          {m.feeNote && <p className="text-[13px] text-n-555"><T s="참가비·준비물: {feeNote}" vars={{ feeNote: m.feeNote }} /></p>}
        </section>
      )}

      {m.announcements.length > 0 && (
        <section className="td-sec" aria-label={st('공지')}>
          <p className="td-label flex items-center gap-1"><Megaphone className="w-3 h-3" aria-hidden /> <T>공지</T></p>
          <div className="td-rows">
            {m.announcements.map((a) => (
              <div key={a.id} className="moim-flat-notice">
                <p className="text-[14px] whitespace-pre-wrap" style={{ color: 'var(--n-222)' }}>{a.body}</p>
                <p className="text-[11.5px] text-n-999"><KstDate iso={a.createdAt} /></p>
              </div>
            ))}
          </div>
        </section>
      )}

      <MoimApplyPanel moim={m} />

      {/* A29: the discussion is where the details get decided — last, with the reply box pinned */}
      {m.threadPostId && <MoimThread postId={m.threadPostId} />}
    </div>
  )
}
