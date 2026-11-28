'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Globe, MapPin, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import type { MoimDetail, MoimGroupRef } from '@/lib/data/moim'
import { moimStartFromInput, moimStartToInput } from '@/lib/moim-thread-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { GroupAvatar } from '@/components/groups/group-avatar'
import { InviteInput } from './invite-input'
import type { MoimInvitee } from '@/lib/data/moim'

const field = 'w-full rounded-xl border border-n-ddd px-3 py-2.5 text-[15px] bg-n-fff focus:outline-none focus:border-n-111'
const lbl = 'block text-[13px] font-semibold mb-1'
const opt = 'font-normal text-n-888'

/**
 * A29: a 모임 is just what / when / 온·오프 / where. Everything else (place details, what to bring,
 * who's coming) is talked through in the 모임's comment thread. Fields this form doesn't show are
 * never sent, so an edit keeps whatever an older 모임 already had.
 */
export function MoimForm({
  me,
  hostGroups,
  initialGroupId = null,
  edit,
  invitees = null,
}: {
  me: { name: string }
  hostGroups: MoimGroupRef[]
  initialGroupId?: string | null
  edit?: MoimDetail
  /** A35: current invitees for the edit form (null = couldn't load → the list isn't shown or sent) */
  invitees?: MoimInvitee[] | null
}) {
  const router = useRouter()
  const start = moimStartToInput(edit?.startsAt, edit?.timeTbd ?? false)
  const [groupId, setGroupId] = useState<string | null>(edit ? edit.group?.id ?? null : initialGroupId)
  const [mode, setMode] = useState<'offline' | 'online'>(edit?.mode ?? 'offline')
  const [title, setTitle] = useState(edit?.title ?? '')
  const [description, setDescription] = useState(edit?.description ?? '')
  const [venueName, setVenueName] = useState(edit?.venueName ?? '')
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [invites, setInvites] = useState<Array<{ handle: string; name: string; avatarUrl: string | null }>>(() => (invitees ?? []).map(({ handle, name, avatarUrl }) => ({ handle, name, avatarUrl })))
  const showInvites = !edit || invitees !== null
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const when = moimStartFromInput(date, time)
    if (!when) return toast.error(tn('날짜를 골라주세요'))
    setBusy(true)
    try {
      const body = {
        title,
        description,
        mode,
        venueName: mode === 'offline' ? venueName : '',
        ...when,
        groupId,
        ...(edit ? { membersOnly: edit.membersOnly } : {}),
        ...(showInvites ? { invites: invites.map((p) => p.handle) } : {}),
      }
      const res = await fetch(edit ? `/api/moim/${edit.id}` : '/api/moim', {
        method: edit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tx('저장하지 못했어요.'))
      if (edit) {
        const inv = data.invites as { added?: number; error?: boolean } | null | undefined
        if (inv?.error) toast.success(tn('모임을 수정했어요 · 초대 목록은 저장하지 못했어요'))
        else if (inv?.added) toast.success(tn('모임을 수정했어요 · {n}명에게 초대를 보냈어요', { n: inv.added }))
        else toast.success(tn('모임을 수정했어요'))
      }
      else if (invites.length && data.invited == null) toast.success(tn('모임을 열었어요 · 초대는 보내지 못했어요'))
      else if (data.invited) toast.success(tn('모임을 열고 {n}명에게 초대를 보냈어요', { n: data.invited }))
      else toast.success(tn('모임을 열었어요'))
      router.push(`/moim/${edit ? edit.id : data.id}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const hostOptions = [{ id: null as string | null, label: tx('개인 ({name})', { name: me.name }) }, ...hostGroups.map((g) => ({ id: g.id as string | null, label: g.name }))]

  return (
    <form onSubmit={submit} className="moim-form space-y-3 pb-24 md:pb-0">
      <div className="flex items-center gap-1">
        <Link href={edit ? `/moim/${edit.id}` : '/moim'} className="tap-target inline-flex items-center justify-center rounded-full icon-btn" aria-label={tx('뒤로')}>
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold" style={{ color: 'var(--n-111)' }}>
          {edit ? <T>모임 수정</T> : <T>모임 열기</T>}
        </h1>
      </div>

      <section className="card p-4 space-y-3.5">
        {!edit && hostGroups.length > 0 && (
          <div className="host-picker flex flex-wrap gap-1.5" role="radiogroup" aria-label={tx('호스트')}>
            {hostOptions.map((o) => {
              const on = groupId === o.id
              return (
                <button key={o.id ?? 'me'} type="button" role="radio" aria-checked={on} onClick={() => setGroupId(o.id)} className={`host-chip${on ? ' on' : ''}`}>
                  <span aria-hidden className="inline-flex">{o.id ? <GroupAvatar name={o.label} size={18} /> : <UserRound className="w-4 h-4" />}</span>
                  <span className="truncate">{o.label}</span>
                </button>
              )
            })}
          </div>
        )}

        <div>
          <label htmlFor="m-title" className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>제목</T>
          </label>
          <input id="m-title" className={field} value={title} onChange={(e) => setTitle(e.target.value)} minLength={2} maxLength={80} required placeholder={tx('예) 판교 AI 에이전트 저녁 모임')} />
        </div>

        <div className="moim-when">
          <div>
            <label htmlFor="m-date" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>날짜</T>
            </label>
            <input id="m-date" type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="m-time" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>시간</T> <span className={opt}><T>(선택)</T></span>
            </label>
            <input id="m-time" type="time" className={field} value={time} onChange={(e) => setTime(e.target.value)} step={600} />
          </div>
        </div>

        <div className="moim-where">
          <div className="seg" role="radiogroup" aria-label={tx('진행 방식')}>
            <button type="button" role="radio" aria-checked={mode === 'offline'} className={mode === 'offline' ? 'on' : ''} onClick={() => setMode('offline')}>
              <MapPin className="w-3.5 h-3.5" /> <T>오프라인</T>
            </button>
            <button type="button" role="radio" aria-checked={mode === 'online'} className={mode === 'online' ? 'on' : ''} onClick={() => setMode('online')}>
              <Globe className="w-3.5 h-3.5" /> <T>온라인</T>
            </button>
          </div>
          {mode === 'offline' && (
            <input id="m-area" aria-label={tx('지역')} className={field} value={venueName} onChange={(e) => setVenueName(e.target.value)} maxLength={120} placeholder={tx('지역 (예: 판교역 인근)')} />
          )}
        </div>

        <div>
          <label htmlFor="m-desc" className={lbl} style={{ color: 'var(--n-111)' }}>
            <T>한 줄 소개</T> <span className={opt}><T>(선택)</T></span>
          </label>
          <textarea id="m-desc" className={field} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} placeholder={tx('어떤 모임인지 한 줄로')} />
        </div>

        {showInvites && (
          <div>
            <label htmlFor="m-invite" className={lbl} style={{ color: 'var(--n-111)' }}>
              <T>초대</T> <span className={opt}>{edit ? <T>(새로 추가한 분께만 알림이 가요)</T> : <T>(선택 · 알림이 가요)</T>}</span>
            </label>
            <InviteInput value={invites} onChange={setInvites} />
            {edit && <p className="text-[12px] text-n-888 mt-1.5"><T>빼면 초대만 취소돼요 · 알림은 가지 않고, 이미 참여 확정된 분은 그대로예요.</T></p>}
            {groupId && <p className="text-[12px] text-n-888 mt-1.5"><T>그룹 모임은 그 그룹 멤버에게만 초대가 가요.</T></p>}
          </div>
        )}
      </section>

      <p className="px-1 text-[12.5px] text-n-777">
        <T>장소·준비물 같은 자세한 이야기는 모임을 연 뒤 댓글로 나눠요.</T>
      </p>

      <div className="sticky-actions" style={{ position: 'sticky', bottom: 'calc(64px + env(safe-area-inset-bottom))', zIndex: 5 }}>
        <button type="submit" disabled={busy} className="btn btn-primary w-full min-h-[48px] rounded-full text-[15px]">
          {busy ? <T>저장 중…</T> : edit ? <T>수정 저장</T> : <T>모임 열기</T>}
        </button>
      </div>
    </form>
  )
}
