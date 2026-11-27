'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { MoimDetail } from '@/lib/data/moim'
import { RsvpBadge } from './moim-badges'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { msg } from '@/i18n/translate'

const STATUS_COPY = {
  confirmed: msg('참석이 확정됐어요. 정확한 장소·링크가 위에 보여요.'),
  pending: msg('호스트가 신청을 확인하고 있어요. 결과는 이 페이지와 ‘모임 › 신청 현황’에서 확인할 수 있어요.'),
  waitlisted: msg('정원이 차서 대기 중이에요. 빈자리가 생기면 순서대로 자동 확정돼요.'),
  rejected: msg('이번 모임에는 함께하지 못하게 됐어요.'),
  cancelled: msg('신청을 취소했어요.'),
  interested: msg('관심을 표시했어요. 참석하려면 아래에서 신청하세요.'),
} as const

/** The applicant side: apply form with the host's questions, or my status (incl. waitlist position) + cancel. */
export function MoimApplyPanel({ moim: m }: { moim: MoimDetail }) {
  const router = useRouter()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  if (m.isHost) return null

  const r = m.myRsvp
  const active = r && (r.status === 'confirmed' || r.status === 'pending' || r.status === 'waitlisted')
  const deadlinePassed = m.applyDeadline ? new Date(m.applyDeadline) < new Date() : false
  const startedPast = new Date(m.startsAt) < new Date()
  const full = m.confirmed >= m.capacity

  async function call(method: 'POST' | 'DELETE') {
    if (busy) return
    if (method === 'DELETE' && !confirm(r?.status === 'confirmed' ? tn('참석을 취소할까요? 자리는 대기자에게 넘어가요.') : tn('신청을 취소할까요?'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/moim/${m.id}/apply`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'POST' ? JSON.stringify({ answers, note: note.trim() || null }) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '처리하지 못했어요.')
      if (method === 'POST') toast.success(data.status === 'confirmed' ? tn('참석 확정!') : data.status === 'waitlisted' ? tn('대기열에 올렸어요') : tn('신청했어요. 호스트 승인을 기다려주세요'))
      else toast.success(tn('취소했어요'))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function interest() {
    if (busy) return
    if (r?.status === 'interested' && !confirm(tn('관심을 취소할까요?'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/moim/${m.id}/interest`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '처리하지 못했어요.')
      toast.success(data.status === 'interested' ? tn('관심을 표시했어요.') : tn('취소했어요'))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  if (r && r.status === 'interested' && !startedPast && m.status === 'open') {
    return (
      <section className="card p-4 space-y-3" aria-label={tx('내 신청 현황')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--n-111)' }}>
            <T>내 신청 현황</T>
          </h2>
          <RsvpBadge status="interested" />
        </div>
        <p className="text-[13.5px]" style={{ color: 'var(--n-444)' }}>{STATUS_COPY.interested}</p>
        {m.questions.length === 0 ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <button type="button" disabled={busy} onClick={() => call('POST')} className="btn btn-primary min-h-[44px] rounded-full flex-1">
              {m.requiresApproval ? <T>참가 신청 (호스트 승인)</T> : full ? <T>대기 신청</T> : <T>참석하기</T>}
            </button>
            <button type="button" disabled={busy} onClick={() => interest()} className="btn btn-secondary min-h-[44px] rounded-full">
              <T>관심 취소</T>
            </button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); call('POST') }}>
            {m.questions.map((q) => (
              <div key={q.id}>
                <label htmlFor={`ans-i-${q.id}`} className="block text-[13px] font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
                  {q.label} {q.required ? <span className="text-c-b42318">*</span> : <span className="font-normal text-n-999"><T>(선택)</T></span>}
                </label>
                <textarea id={`ans-i-${q.id}`} rows={2} maxLength={500} required={q.required} className="w-full rounded-xl border border-n-ddd px-3 py-2 text-[15px] focus:outline-none focus:border-n-111" value={answers[q.id] || ''} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              </div>
            ))}
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="submit" disabled={busy} className="btn btn-primary min-h-[48px] rounded-full flex-1 text-[15px]">
                {busy ? <T>신청 중…</T> : m.requiresApproval ? <T>참가 신청 (호스트 승인)</T> : full ? <T>대기 신청</T> : <T>참석하기</T>}
              </button>
              <button type="button" disabled={busy} onClick={() => interest()} className="btn btn-secondary min-h-[44px] rounded-full">
                <T>관심 취소</T>
              </button>
            </div>
          </form>
        )}
      </section>
    )
  }

  if (r && r.status !== 'cancelled') {
    return (
      <section className="card p-4 space-y-2" aria-label={tx('내 신청 현황')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-bold" style={{ color: 'var(--n-111)' }}>
            <T>내 신청 현황</T>
          </h2>
          <RsvpBadge status={r.status} position={r.position} />
        </div>
        <p className="text-[13.5px]" style={{ color: 'var(--n-444)' }}>
          {STATUS_COPY[r.status]}
          {r.status === 'waitlisted' && r.position ? tx(' 지금 대기 {position}번째예요.', { position: r.position }) : ''}
        </p>
        {m.questions.length > 0 && Object.keys(r.answers).length > 0 && (
          <dl className="rounded-xl p-3 space-y-1.5 text-[13px]" style={{ background: 'var(--n-fafafa)' }}>
            {m.questions.map((q) =>
              r.answers[q.id] ? (
                <div key={q.id}>
                  <dt className="text-n-777"><T>{q.label}</T></dt>
                  <dd style={{ color: 'var(--n-111)' }}>{r.answers[q.id]}</dd>
                </div>
              ) : null
            )}
          </dl>
        )}
        {active && !startedPast && (
          <button onClick={() => call('DELETE')} disabled={busy} className="btn btn-secondary btn-sm min-h-[44px] rounded-full w-full md:w-auto">
            {r.status === 'confirmed' ? <T>참석 취소</T> : <T>신청 취소</T>}
          </button>
        )}
      </section>
    )
  }

  let blocked: React.ReactNode = null
  if (m.status === 'cancelled') blocked = tx('취소된 모임이에요.')
  else if (m.status !== 'open' || startedPast) blocked = tx('신청이 마감됐어요.')
  else if (deadlinePassed) blocked = tx('신청 마감 시간이 지났어요.')
  else if (m.membersOnly && m.group && !m.isGroupMember)
    blocked = (
      <>
        <b>{m.group.name}</b> 그룹 멤버만 신청할 수 있어요.{' '}
        <Link href={`/groups/${m.group.slug}`} className="underline font-semibold">
          <T>그룹 보기</T>
        </Link>
      </>
    )

  return (
    <section className="card p-4 space-y-3" aria-label={tx('신청')}>
      <h2 className="text-[15px] font-bold" style={{ color: 'var(--n-111)' }}>
        {r?.status === 'cancelled' ? <T>다시 신청하기</T> : <T>신청하기</T>}
      </h2>
      {blocked ? (
        <p className="text-[13.5px]" style={{ color: 'var(--n-666)' }}>
          {blocked}
        </p>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            call('POST')
          }}
        >
          {m.questions.map((q) => (
            <div key={q.id}>
              <label htmlFor={`ans-${q.id}`} className="block text-[13px] font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
                {q.label} {q.required ? <span className="text-c-b42318">*</span> : <span className="font-normal text-n-999"><T>(선택)</T></span>}
              </label>
              <textarea
                id={`ans-${q.id}`}
                rows={2}
                maxLength={500}
                required={q.required}
                className="w-full rounded-xl border border-n-ddd px-3 py-2 text-[15px] focus:outline-none focus:border-n-111"
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label htmlFor="ans-note" className="block text-[13px] font-semibold mb-1" style={{ color: 'var(--n-111)' }}>
              <T>호스트에게 한마디</T> <span className="font-normal text-n-999"><T>(선택)</T></span>
            </label>
            <input id="ans-note" maxLength={300} className="w-full rounded-xl border border-n-ddd px-3 py-2.5 text-[15px] focus:outline-none focus:border-n-111" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <p className="text-[12px] text-n-888">{m.group ? <T>답변은 호스트와 그룹 운영진만 볼 수 있어요.</T> : <T>답변은 호스트만 볼 수 있어요.</T>}</p>
          <div className="flex flex-col gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary w-full min-h-[48px] rounded-full text-[15px]">
              {busy ? <T>신청 중…</T> : m.requiresApproval ? <T>참가 신청 (호스트 승인)</T> : full ? <T>대기 신청</T> : <T>참석하기</T>}
            </button>
            <button type="button" disabled={busy} onClick={() => interest()} className="btn btn-secondary w-full min-h-[44px] rounded-full text-[15px]">
              <T>관심 표시</T>
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
