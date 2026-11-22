'use client'

import { msg } from '@/i18n/translate'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { Group } from '@/lib/data/groups'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

async function act(groupId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/groups/${groupId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '처리하지 못했어요.')
  return data as { result?: string }
}

/** Header button: join (open) / request (approval) / accept invite / cancel request / leave. */
export function GroupJoinButton({ g }: { g: Group }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [message, setMessage] = useState('')

  async function run(body: Record<string, unknown>, ok: string) {
    if (busy) return
    setBusy(true)
    try {
      await act(g.id, body)
      toast.success(ok)
      setAsking(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const cls = 'btn btn-sm min-h-[40px] rounded-full'
  if (g.myStatus === 'active') {
    if (g.myRole === 'owner') return null
    return (
      <button className={`${cls} btn-secondary`} disabled={busy} onClick={() => confirm(tn("'{name}' 그룹에서 나갈까요?", { name: g.name })) && run({ action: 'leave' }, msg('그룹에서 나왔어요'))}>
        <T>나가기</T>
      </button>
    )
  }
  if (g.myStatus === 'pending')
    return (
      <button className={`${cls} btn-secondary`} disabled={busy} onClick={() => run({ action: 'leave' }, msg('가입 요청을 취소했어요'))}>
        <T>요청 취소</T>
      </button>
    )
  if (g.myStatus === 'invited')
    return (
      <span className="inline-flex gap-1.5">
        <button className={`${cls} btn-primary`} disabled={busy} onClick={() => run({ action: 'join' }, msg('그룹에 가입했어요'))}>
          <T>초대 수락</T>
        </button>
        <button className={`${cls} btn-secondary`} disabled={busy} onClick={() => run({ action: 'leave' }, msg('초대를 거절했어요'))}>
          <T>거절</T>
        </button>
      </span>
    )
  if (g.joinPolicy === 'open')
    return (
      <button className={`${cls} btn-primary`} disabled={busy} onClick={() => run({ action: 'join' }, msg('그룹에 가입했어요'))}>
        <T>가입하기</T>
      </button>
    )
  return asking ? (
    <form
      className="flex flex-col gap-1.5 w-full md:w-72"
      onSubmit={(e) => {
        e.preventDefault()
        run({ action: 'join', message: message.trim() || null }, msg('가입을 요청했어요'))
      }}
    >
      <input autoFocus maxLength={200} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tx('한마디 (선택)')} className="rounded-xl border border-n-ddd px-3 py-2 text-[15px]" />
      <span className="flex gap-1.5">
        <button type="submit" className={`${cls} btn-primary flex-1`} disabled={busy}>
          <T>요청 보내기</T>
        </button>
        <button type="button" className={`${cls} btn-secondary`} onClick={() => setAsking(false)}>
          <T>취소</T>
        </button>
      </span>
    </form>
  ) : (
    <button className={`${cls} btn-primary`} onClick={() => setAsking(true)}>
      <T>가입 요청</T>
    </button>
  )
}

export { act as groupAct }
