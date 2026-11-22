'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { MoimApplicant, MoimDetail } from '@/lib/data/moim'
import type { DecideAction, RsvpStatus } from '@/lib/moim-rules'
import { kstDateTime } from '@/lib/kst'
import { UserAvatar } from '@/components/user-avatar'
import { RsvpBadge } from './moim-badges'

const GROUPS: Array<{ s: RsvpStatus; label: string }> = [
  { s: 'pending', label: '승인 대기' },
  { s: 'confirmed', label: '참석 확정' },
  { s: 'waitlisted', label: '대기열' },
  { s: 'rejected', label: '거절' },
  { s: 'cancelled', label: '취소' },
]

const ACTIONS: Record<RsvpStatus, Array<{ a: DecideAction; label: string; primary?: boolean }>> = {
  pending: [
    { a: 'approve', label: '승인', primary: true },
    { a: 'waitlist', label: '대기' },
    { a: 'reject', label: '거절' },
  ],
  waitlisted: [
    { a: 'approve', label: '확정', primary: true },
    { a: 'reject', label: '거절' },
  ],
  confirmed: [{ a: 'remove', label: '참석 취소시키기' }],
  rejected: [],
  cancelled: [],
}

/** Host / group managers: applicants with answers, decisions, capacity, close/cancel, announcements. */
export function MoimHostPanel({ moim: m }: { moim: MoimDetail }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [capacity, setCapacity] = useState(m.capacity)
  const [showClosed, setShowClosed] = useState(false)
  const applicants = m.applicants || []
  const pos = new Map(
    applicants
      .filter((a) => a.status === 'waitlisted')
      .sort((a, b) => (a.waitlistedAt || a.createdAt).localeCompare(b.waitlistedAt || b.createdAt))
      .map((a, i) => [a.id, i + 1])
  )

  async function req(key: string, url: string, method: string, body: unknown, ok: string) {
    if (busy) return
    setBusy(key)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '처리하지 못했어요.')
      toast.success(data.promoted ? `${ok} · 대기자 ${data.promoted}명 자동 확정` : ok)
      router.refresh()
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리하지 못했어요.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const decide = (a: MoimApplicant, action: DecideAction) => {
    if (action === 'remove' && !confirm(`${a.author.name}님의 참석을 취소할까요? 자리는 대기자에게 넘어가요.`)) return
    req(`${a.id}:${action}`, `/api/moim/${m.id}/decide`, 'POST', { rsvpId: a.id, action }, '반영했어요')
  }

  const saveCapacity = () =>
    req(
      'cap',
      `/api/moim/${m.id}`,
      'PATCH',
      {
        title: m.title,
        description: m.description,
        mode: m.mode,
        venueName: m.venueName,
        venueAddress: m.private?.venueAddress ?? null,
        mapUrl: m.private?.mapUrl ?? null,
        meetingUrl: m.private?.meetingUrl ?? null,
        startsAt: m.startsAt,
        endsAt: m.endsAt,
        applyDeadline: m.applyDeadline,
        capacity: Number(capacity),
        requiresApproval: m.requiresApproval,
        feeNote: m.feeNote,
        groupId: m.group?.id ?? null,
        membersOnly: m.membersOnly,
        questions: m.questions.map((q) => ({ label: q.label, required: q.required })),
      },
      '정원을 바꿨어요'
    )

  const setStatus = (status: 'open' | 'closed' | 'cancelled') => {
    if (status === 'cancelled' && !confirm('모임을 취소할까요? 신청자들에게 취소된 모임으로 표시돼요.')) return
    req(`st:${status}`, `/api/moim/${m.id}`, 'PATCH', { status }, status === 'open' ? '신청을 다시 열었어요' : status === 'closed' ? '신청을 마감했어요' : '모임을 취소했어요')
  }

  const visible = GROUPS.filter((g) => showClosed || (g.s !== 'rejected' && g.s !== 'cancelled'))
  const hiddenCount = applicants.filter((a) => a.status === 'rejected' || a.status === 'cancelled').length

  return (
    <section className="moim-host card p-4 space-y-4" aria-label="참석자 관리">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-bold" style={{ color: '#111' }}>
          참석자 관리
        </h2>
        <span className="text-[12px] text-[#777]">{m.isHost ? '호스트' : '그룹 운영진'} 전용</span>
      </div>

      {visible.map(({ s, label }) => {
        const list = applicants.filter((a) => a.status === s)
        if (!list.length && s !== 'pending') return null
        if (!list.length && !m.requiresApproval) return null
        return (
          <div key={s} className="space-y-2">
            <h3 className="text-[13px] font-semibold" style={{ color: '#444' }}>
              {label} <span className="tabular-nums text-[#999]">{list.length}</span>
            </h3>
            {list.length === 0 && <p className="text-[12.5px] text-[#999]">새 신청이 없어요.</p>}
            {list.map((a) => (
              <div key={a.id} className="applicant rounded-xl p-3 space-y-2" style={{ border: '1px solid #eee' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <UserAvatar id={a.author.id} name={a.author.name} avatarUrl={a.author.avatarUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold truncate" style={{ color: '#111' }}>
                      {a.author.name}
                    </p>
                    <p className="text-[11.5px] text-[#999]">{kstDateTime(a.createdAt)} 신청</p>
                  </div>
                  <RsvpBadge status={a.status} position={pos.get(a.id) ?? null} />
                </div>
                {(m.questions.some((q) => a.answers[q.id]) || a.note) && (
                  <dl className="rounded-lg p-2.5 space-y-1 text-[13px]" style={{ background: '#fafafa' }}>
                    {m.questions.map((q) =>
                      a.answers[q.id] ? (
                        <div key={q.id}>
                          <dt className="text-[#777] text-[12px]">{q.label}</dt>
                          <dd style={{ color: '#111' }}>{a.answers[q.id]}</dd>
                        </div>
                      ) : null
                    )}
                    {a.note && (
                      <div>
                        <dt className="text-[#777] text-[12px]">한마디</dt>
                        <dd style={{ color: '#111' }}>{a.note}</dd>
                      </div>
                    )}
                  </dl>
                )}
                {ACTIONS[a.status].length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {ACTIONS[a.status].map(({ a: act, label: l, primary }) => (
                      <button
                        key={act}
                        onClick={() => decide(a, act)}
                        disabled={busy !== null}
                        className={`btn btn-sm min-h-[40px] rounded-full ${primary ? 'btn-primary' : 'btn-secondary'}`}
                      >
                        {busy === `${a.id}:${act}` ? '…' : l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })}
      {hiddenCount > 0 && (
        <button onClick={() => setShowClosed(!showClosed)} className="text-[12.5px] underline text-[#666] min-h-[36px]">
          {showClosed ? '거절·취소 숨기기' : `거절·취소 ${hiddenCount}명 보기`}
        </button>
      )}

      <div className="grid gap-3 pt-3" style={{ borderTop: '1px solid #eee', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))' }}>
        <div>
          <label htmlFor="cap" className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            정원 <span className="font-normal text-[#888]">(늘리면 대기자 자동 확정)</span>
          </label>
          <div className="flex gap-2">
            <input id="cap" type="number" min={Math.max(1, m.confirmed)} max={500} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} className="w-24 rounded-xl border border-[#ddd] px-3 py-2 text-[15px]" />
            <button onClick={saveCapacity} disabled={busy !== null || capacity === m.capacity} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
              저장
            </button>
          </div>
        </div>
        <div>
          <span className="block text-[13px] font-semibold mb-1" style={{ color: '#111' }}>
            신청 상태
          </span>
          <div className="flex flex-wrap gap-1.5">
            {m.status === 'open' ? (
              <button onClick={() => setStatus('closed')} disabled={busy !== null} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
                신청 마감
              </button>
            ) : m.status === 'closed' ? (
              <button onClick={() => setStatus('open')} disabled={busy !== null} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
                다시 열기
              </button>
            ) : null}
            {m.status !== 'cancelled' && (
              <button onClick={() => setStatus('cancelled')} disabled={busy !== null} className="btn btn-sm min-h-[40px] rounded-full" style={{ color: '#b42318', border: '1px solid #f3c7c3' }}>
                모임 취소
              </button>
            )}
          </div>
        </div>
      </div>

      <form
        className="space-y-2 pt-3"
        style={{ borderTop: '1px solid #eee' }}
        onSubmit={async (e) => {
          e.preventDefault()
          if (!notice.trim()) return
          if (await req('ann', `/api/moim/${m.id}/announcements`, 'POST', { body: notice.trim() }, '공지를 올렸어요')) setNotice('')
        }}
      >
        <label htmlFor="ann" className="block text-[13px] font-semibold" style={{ color: '#111' }}>
          참석자 공지 <span className="font-normal text-[#888]">(이 페이지의 공지 칸에 보여요)</span>
        </label>
        <textarea id="ann" rows={2} maxLength={1000} value={notice} onChange={(e) => setNotice(e.target.value)} className="w-full rounded-xl border border-[#ddd] px-3 py-2 text-[15px]" placeholder="예) 2층 회의실로 오세요" />
        <button type="submit" disabled={busy !== null || !notice.trim()} className="btn btn-primary btn-sm min-h-[40px] rounded-full">
          공지 올리기
        </button>
      </form>
    </section>
  )
}
