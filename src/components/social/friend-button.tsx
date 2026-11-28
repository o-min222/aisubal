'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { HeartHandshake, Clock, Check, X } from 'lucide-react'
import { toast } from 'sonner'
import type { FriendState } from '@/lib/social-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

/**
 * Friend flow, separate from follow: 친구 신청 → (상대) 수락/거절 → 친구 (끊기 가능).
 * A mutual follow (맞팔) does NOT make people friends.
 */
export function FriendButton({
  memberId,
  initialState,
  compact = false,
  onChange,
}: {
  memberId: string
  initialState: FriendState
  compact?: boolean
  onChange?: (s: FriendState) => void
}) {
  const router = useRouter()
  const [state, setState] = useState<FriendState>(initialState)
  const [busy, setBusy] = useState(false)

  async function act(action: 'request' | 'accept' | 'decline' | 'remove', e?: React.MouseEvent) {
    e?.preventDefault()
    e?.stopPropagation()
    if (busy) return
    if (action === 'remove' && state === 'friends' && !window.confirm(tn('친구를 끊을까요? 팔로우는 그대로 유지돼요.'))) return
    setBusy(true)
    try {
      const res = await fetch('/api/social/friend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tx('처리하지 못했어요.'))
      const next = (data.relation?.friend ?? 'none') as FriendState
      setState(next)
      onChange?.(next)
      toast.success(
        action === 'request' ? (next === 'friends' ? tx('친구가 됐어요') : tx('친구 요청을 보냈어요')) : action === 'accept' ? tx('친구가 됐어요') : action === 'decline' ? tx('요청을 거절했어요') : tx('정리했어요')
      )
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const size = compact ? 'min-h-[36px] px-3' : 'min-h-[40px] px-4'
  if (state === 'pending_in') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button type="button" disabled={busy} onClick={(e) => act('accept', e)} className={`btn btn-primary btn-sm rounded-full ${size}`}>
          <Check className="w-4 h-4" /> <T>친구 수락</T>
        </button>
        <button type="button" disabled={busy} onClick={(e) => act('decline', e)} className={`btn btn-secondary btn-sm rounded-full ${size}`} aria-label={tx('친구 요청 거절')}>
          <X className="w-4 h-4" /> {compact ? '' : <T>거절</T>}
        </button>
      </span>
    )
  }
  if (state === 'pending_out') {
    return (
      <button type="button" disabled={busy} onClick={(e) => act('remove', e)} className={`btn btn-secondary btn-sm rounded-full ${size}`} title={tx('눌러서 요청 취소')}>
        <Clock className="w-4 h-4" /> <T>요청 보냄</T>
      </button>
    )
  }
  if (state === 'friends') {
    return (
      <button type="button" disabled={busy} onClick={(e) => act('remove', e)} className={`btn btn-secondary btn-sm rounded-full ${size}`} title={tx('눌러서 친구 끊기')} style={{ color: 'var(--c-1f7a4d)' }}>
        <HeartHandshake className="w-4 h-4" /> <T>친구</T>
      </button>
    )
  }
  return (
    <button type="button" disabled={busy} onClick={(e) => act('request', e)} className={`btn btn-secondary btn-sm rounded-full ${size}`}>
      <HeartHandshake className="w-4 h-4" /> <T>친구 신청</T>
    </button>
  )
}
