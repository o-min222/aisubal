'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { tn, tx } from '@/i18n/client'

/**
 * A84: the gallery's Product Hunt-style upvote — a bordered box with ▲ and the count. It is the
 * existing one-tap 좋아요 (POST/DELETE /api/tools/{id}/like, like_count), so votes and likes are one signal.
 */
export function UpvoteBox({ entryId, name, voted: initialVoted, count: initialCount, size = 'row' }: { entryId: string; name: string; voted: boolean; count: number; size?: 'row' | 'lg' }) {
  const router = useRouter()
  const [voted, setVoted] = useState(initialVoted)
  const [count, setCount] = useState(initialCount)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const on = !voted
    setBusy(true)
    setVoted(on)
    setCount((n) => Math.max(0, n + (on ? 1 : -1)))
    try {
      const res = await fetch(`/api/tools/${entryId}/like`, { method: on ? 'POST' : 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      if (typeof data.likeCount === 'number') setCount(data.likeCount)
      router.refresh()
    } catch (err) {
      setVoted(!on)
      setCount((n) => Math.max(0, n + (on ? -1 : 1)))
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`ph-vote${size === 'lg' ? ' ph-vote-lg' : ''}${voted ? ' on' : ''}`}
      aria-pressed={voted}
      aria-label={voted ? tx('{name} 좋아요 취소', { name }) : tx('{name} 좋아요', { name })}
      onClick={toggle}
    >
      <svg viewBox="0 0 12 10" className="ph-vote-ic" aria-hidden>
        <path d="M6 0.8 11.2 9.2H0.8Z" />
      </svg>
      <span className="tabular-nums">{count}</span>
      {size === 'lg' && <span className="ph-vote-label">{tx('좋아요')}</span>}
    </button>
  )
}
