'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { NOTIFY_READ_EVENT } from '@/lib/notifications'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type FriendReply = 'accepted' | 'declined'

/**
 * A86 · inline 수락 / 거절 for one incoming friend request (feed card, notification rows, 친구·팔로워 inbox).
 * Answers in place, no page change; afterwards it shows the outcome and asks the bell/avatar counts to refresh.
 */
export function FriendRequestActions({ memberId, name, onDone }: { memberId: string; name: string; onDone?: (r: FriendReply) => void }) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<FriendReply | null>(null)

  async function act(action: 'accept' | 'decline', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy || done) return
    setBusy(true)
    try {
      const res = await fetch('/api/social/friend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ memberId, action }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      const r: FriendReply = action === 'accept' ? 'accepted' : 'declined'
      setDone(r)
      onDone?.(r)
      if (r === 'accepted') toast.success(tx('{name}님과 친구가 됐어요', { name }))
      window.dispatchEvent(new Event(NOTIFY_READ_EVENT))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <span className={`fr-done${done === 'accepted' ? ' is-ok' : ''}`} role="status">
        {done === 'accepted' ? <><Check className="w-3.5 h-3.5" aria-hidden /> <T>친구가 됐어요</T></> : <T>거절했어요</T>}
      </span>
    )
  }
  return (
    <span className="fr-actions">
      <button type="button" className="fr-accept" disabled={busy} onClick={(e) => act('accept', e)} aria-label={tx('{name}님의 친구 신청 수락', { name })}>
        <T>수락</T>
      </button>
      <button type="button" className="fr-decline" disabled={busy} onClick={(e) => act('decline', e)} aria-label={tx('{name}님의 친구 신청 거절', { name })}>
        <T>거절</T>
      </button>
    </span>
  )
}
