'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

export function SubscribeButton({ seriesId, initial, signedIn = true }: { seriesId: string; initial: boolean; signedIn?: boolean }) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  if (!signedIn) return null
  async function toggle() {
    if (busy) return
    setBusy(true)
    const next = !on
    const res = await fetch(`/api/articles/series/${seriesId}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: next }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(data.error || tn('처리하지 못했어요.'))
    setOn(Boolean(data.subscribed))
    toast.success(data.subscribed ? tn('이 연재를 구독했어요.') : tn('구독을 해제했어요.'))
  }
  return (
    <button type="button" className={`btn btn-sm ${on ? 'btn-secondary' : 'btn-primary'}`} onClick={() => void toggle()} disabled={busy} aria-pressed={on}>
      {on ? <T>구독 중</T> : <T>구독</T>}
    </button>
  )
}
