'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Globe, Lock, MapPin, Plus, Trash2, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import type { MoimDetail, MoimGroupRef } from '@/lib/data/moim'
import { isoToKstInput, kstInputToIso } from '@/lib/kst'
import { MAX_QUESTIONS } from '@/lib/moim-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type Q = { label: string; required: boolean }

const field = 'w-full rounded-xl border border-n-ddd px-3 py-2.5 text-[15px] bg-n-fff focus:outline-none focus:border-n-111'
const lbl = 'block text-[13px] font-semibold mb-1'

export function MoimForm({
  me,
  hostGroups,
  initialGroupId = null,
  edit,
}: {
  me: { name: string }
  hostGroups: MoimGroupRef[]
  initialGroupId?: string | null
  edit?: MoimDetail
}) {
  const router = useRouter()
  const [groupId, setGroupId] = useState<string | null>(edit ? edit.group?.id ?? null : initialGroupId)
  const [membersOnly, setMembersOnly] = useState(edit?.membersOnly ?? false)
  const [mode, setMode] = useState<'offline' | 'online'>(edit?.mode ?? 'offline')
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [venueName, setVenueName] = useState(edit?.venueName ?? '')
  const [venueAddress, setVenueAddress] = useState(edit?.private?.venueAddress ?? '')
  const [mapUrl, setMapUrl] = useState(edit?.private?.mapUrl ?? '')
  const [meetingUrl, setMeetingUrl] = useState(edit?.private?.meetingUrl ?? '')
  const [startsAt, setStartsAt] = useState(isoToKstInput(edit?.startsAt))
  const [endsAt, setEndsAt] = useState(isoToKstInput(edit?.endsAt))
  const [deadline, setDeadline] = useState(isoToKstInput(edit?.applyDeadline))
  const [capacity, setCapacity] = useState(edit?.capacity ?? 10)
  const [approval, setApproval] = useState(edit?.requiresApproval ?? false)
  const [feeNote, setFeeNote] = useState(edit?.feeNote ?? '')
  const [questions, setQuestions] = useState<Q[]>(edit?.questions.map((q) => ({ label: q.label, required: q.required })) ?? [])
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const body = {
        title,
        description,
        mode,
        venueName: mode === 'offline' ? venueName : '',
        venueAddress: mode === 'offline' ? venueAddress : '',
        mapUrl: mode === 'offline' ? mapUrl : '',
        meetingUrl: mode === 'online' ? meetingUrl : '',
        startsAt: kstInputToIso(startsAt),
        endsAt: endsAt ? kstInputToIso(endsAt) : null,
        applyDeadline: deadline ? kstInputToIso(deadline) : null,
        capacity: Number(capacity),
        requiresApproval: approval,
        feeNote,
        groupId,
        membersOnly: Boolean(groupId && membersOnly),
        questions: questions.filter((q) => q.label.trim()),
      }
      const res = await fetch(edit ? `/api/moim/${edit.id}` : '/api/moim', {
        method: edit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.')
      toast.success(edit ? tn('모임을 수정했어요') : tn('모임을 열었어요'))
      router.push(`/moim/${edit ? edit.id : data.id}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const hostOptions = [{ id: null as string | null, label: tx('개인 ({name})', { name: me.name }), emoji: null as string | null }, ...hostGroups.map((g) => ({ id: g.id as string | null, label: g.name, emoji: g.emoji }))]

  return (
    <form onSubmit={submit} className="space-y-3 pb-24 md:pb-0">
      <div className="flex items-center gap-1">
        <Link href={edit ? `/moim/${edit.id}` : '/moim'} className="tap-target inline-flex items-center justify-center rounded-full hover:bg-n-f2f2f2" aria-label={tx('뒤로')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold" style={{ color: 'var(--n-111)' }}>
          {edit ? <T>모임 수정</T> : <T>모임 열기</T>}
        </h1>
      </div>

      <section className="card p-4 space-y-3">
        <div>
          <span className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>호스트</T>
          </span>
          {edit ? (
            <p className="text-sm text-n-555"><T s="{v} · 호스트는 바꿀 수 없어요" vars={{ v: edit.group ? tx('{v} {name} 그룹', { v: edit.group.emoji || '', name: edit.group.name }) : tx('개인 ({name})', { name: edit.host.name }) }} /></p>
          ) : (
            <div className="host-picker grid gap-2" role="radiogroup" aria-label={tx('호스트')} style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 180px), 1fr))' }}>
              {hostOptions.map((o) => {
                const on = groupId === o.id
                return (
                  <button
                    key={o.id ?? 'me'}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setGroupId(o.id)}
                    className="flex items-center gap-2 rounded-xl px-3 text-left min-h-[48px]"
                    style={{ border: on ? '2px solid var(--n-111)' : '1px solid var(--n-ddd)', background: on ? 'var(--n-fafafa)' : 'var(--n-fff)' }}
                  >
                    <span aria-hidden className="w-6 text-center">{o.id ? o.emoji || '#' : <UserRound className="w-4 h-4 inline" />}</span>
                    <span className="text-[14px] font-medium truncate" style={{ color: 'var(--n-111)' }}>
                      <T>{o.label}</T>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {!edit && hostGroups.length === 0 && (
            <p className="text-[12px] text-n-888 mt-1.5"><T>내가 소유자·매니저인 그룹이 있으면 그룹 이름으로도 열 수 있어요.</T></p>
          )}
          {groupId && (
            <label className="flex items-center gap-2 mt-2.5 text-sm min-h-[40px]" style={{ color: 'var(--n-333)' }}>
              <input type="checkbox" checked={membersOnly} onChange={(e) => setMembersOnly(e.target.checked)} className="w-4 h-4" />
              <Lock className="w-3.5 h-3.5" /> <T>그룹 멤버만 신청할 수 있게</T>
            </label>
          )}
        </div>

        <div>
          <label htmlFor="m-title" className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>제목</T>
          </label>
          <input id="m-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder={tx('예) 판교 AI 에이전트 저녁 모임')} />
        </div>
        <div>
          <label htmlFor="m-desc" className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>소개</T>
          </label>
          <textarea id="m-desc" className={field} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} required placeholder={tx('무엇을 하는 모임인지, 누구에게 맞는지 적어주세요.')} />
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <div className="seg" role="radiogroup" aria-label={tx('진행 방식')}>
          <button type="button" role="radio" aria-checked={mode === 'offline'} className={mode === 'offline' ? 'on' : ''} onClick={() => setMode('offline')}>
            <MapPin className="w-3.5 h-3.5" /> <T>오프라인</T>
          </button>
          <button type="button" role="radio" aria-checked={mode === 'online'} className={mode === 'online' ? 'on' : ''} onClick={() => setMode('online')}>
            <Globe className="w-3.5 h-3.5" /> <T>온라인</T>
          </button>
        </div>
        {mode === 'offline' ? (
          <>
            <div>
              <label htmlFor="m-area" className={lbl} style={{ color: 'var(--n-111)' }}>
                <T>지역 (모두에게 공개)</T>
              </label>
              <input id="m-area" className={field} value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={120} placeholder={tx('예) 판교역 인근')} />
            </div>
            <div>
              <label htmlFor="m-addr" className={lbl} style={{ color: 'var(--n-111)' }}>
                <T>정확한 장소·주소</T> <span className="font-normal text-n-888"><T>(참석 확정자에게만)</T></span>
              </label>
              <input id="m-addr" className={field} value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} maxLength={300} placeholder={tx('도로명 주소, 층·호수')} />
            </div>
            <div>
              <label htmlFor="m-map" className={lbl} style={{ color: 'var(--n-111)' }}>
                <T>지도 링크</T> <span className="font-normal text-n-888"><T>(참석 확정자에게만)</T></span>
              </label>
              <input id="m-map" className={field} value={mapUrl} onChange={(e) => setMapUrl(e.target.value)} placeholder="https://map.naver.com/…" inputMode="url" />
            </div>
          </>
        ) : (
          <div>
            <label htmlFor="m-link" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>온라인 링크</T> <span className="font-normal text-n-888"><T>(참석 확정자에게만)</T></span>
            </label>
            <input id="m-link" className={field} value={meetingUrl} onChange={(e) => setMeetingUrl(e.target.value)} placeholder="https://meet.google.com/…" inputMode="url" />
          </div>
        )}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }}>
          <div>
            <label htmlFor="m-start" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>시작 (한국 시간)</T>
            </label>
            <input id="m-start" type="datetime-local" className={field} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="m-end" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>종료</T> <span className="font-normal text-n-888"><T>(선택)</T></span>
            </label>
            <input id="m-end" type="datetime-local" className={field} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-deadline" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>신청 마감</T> <span className="font-normal text-n-888"><T>(선택)</T></span>
            </label>
            <input id="m-deadline" type="datetime-local" className={field} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </div>
          <div>
            <label htmlFor="m-cap" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>정원</T>
            </label>
            <input id="m-cap" type="number" min={1} max={500} className={field} value={capacity} onChange={(e) => setCapacity(Number(e.target.value))} required />
          </div>
        </div>
        <div>
          <label htmlFor="m-fee" className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>참가비·준비물</T> <span className="font-normal text-n-888"><T>(선택)</T></span>
          </label>
          <input id="m-fee" className={field} value={feeNote} onChange={(e) => setFeeNote(e.target.value)} maxLength={200} placeholder={tx('예) 저녁 1/N, 노트북 지참')} />
        </div>
      </section>

      <section className="card p-4 space-y-3">
        <div>
          <span className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>신청 방식</T>
          </span>
          <div className="grid gap-2" role="radiogroup" aria-label={tx('신청 방식')} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}>
            {[
              { v: false, t: tx('선착순'), d: <T>자리가 있으면 바로 확정, 차면 대기열 → 빈자리 생기면 자동 승급</T> },
              { v: true, t: tx('호스트 승인'), d: <T>신청을 보고 승인·대기·거절. 정원이 차면 승인 시 대기열로</T> },
            ].map((o) => (
              <button
                key={String(o.v)}
                type="button"
                role="radio"
                aria-checked={approval === o.v}
                onClick={() => setApproval(o.v)}
                className="text-left rounded-xl px-3 py-2.5"
                style={{ border: approval === o.v ? '2px solid var(--n-111)' : '1px solid var(--n-ddd)' }}
              >
                <span className="block text-[14px] font-semibold" style={{ color: 'var(--n-111)' }}>
                  {o.t}
                </span>
                <span className="block text-[12px] text-n-777 mt-0.5">{o.d}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>신청 질문</T> <span className="font-normal text-n-888"><T s="(선택, 최대 {MAX_QUESTIONS}개 · 호스트만 답변을 봐요)" vars={{ MAX_QUESTIONS }} /></span>
          </span>
          <div className="space-y-2">
            {questions.map((q, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className={field}
                  value={q.label}
                  maxLength={120}
                  aria-label={tx('질문 {v}', { v: i + 1 })}
                  placeholder={tx('예) 보여주고 싶은 워크플로가 있나요?')}
                  onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                />
                <label className="flex items-center gap-1 text-[12.5px] whitespace-nowrap min-h-[40px]" style={{ color: 'var(--n-555)' }}>
                  <input type="checkbox" checked={q.required} onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> <T>필수</T>
                </label>
                <button type="button" onClick={() => setQuestions(questions.filter((_, j) => j !== i))} className="tap-target inline-flex items-center justify-center rounded-full hover:bg-n-f2f2f2" aria-label={tx('질문 {v} 삭제', { v: i + 1 })}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {questions.length < MAX_QUESTIONS && (
              <button type="button" onClick={() => setQuestions([...questions, { label: '', required: false }])} className="btn btn-secondary btn-sm min-h-[40px] rounded-full">
                <Plus className="w-4 h-4" /> <T>질문 추가</T>
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="sticky-actions" style={{ position: 'sticky', bottom: 'calc(64px + env(safe-area-inset-bottom))', zIndex: 5 }}>
        <button type="submit" disabled={busy} className="btn btn-primary w-full min-h-[48px] rounded-full text-[15px]">
          {busy ? <T>저장 중…</T> : edit ? <T>수정 저장</T> : <T>모임 열기</T>}
        </button>
      </div>
    </form>
  )
}
