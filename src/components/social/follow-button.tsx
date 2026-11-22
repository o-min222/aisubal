'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'

/**
 * One-way follow toggle (instant, no approval). `chip` is the compact form
 * used on post cards and in lists; `button` on profiles and the graph card.
 */
export function FollowButton({
  memberId,
  initialFollowing,
  variant = 'button',
  onChange,
  refresh = true,
}: {
  memberId: string
  initialFollowing: boolean
  variant?: 'button' | 'chip'
  onChange?: (following: boolean) => void
  refresh?: boolean
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const next = !following
    setBusy(true)
    setFollowing(next)
    try {
      const res = await fetch('/api/social/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId, follow: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '처리하지 못했어요.')
      onChange?.(next)
      if (refresh) router.refresh()
    } catch (err) {
      setFollowing(!next)
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'chip') {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={following}
        className="follow-chip inline-flex items-center gap-0.5 rounded-full px-2 text-[12px] font-semibold leading-[22px] whitespace-nowrap"
        style={following ? { color: '#666', background: '#f2f2f2' } : { color: '#0066cc', background: '#eef5ff' }}
      >
        {following ? <T>팔로잉</T> : <T>+ 팔로우</T>}
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following}
      className={`btn btn-sm min-h-[40px] rounded-full px-4 ${following ? 'btn-secondary' : 'btn-primary'}`}
    >
      {following ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
      {following ? <T>팔로잉</T> : <T>팔로우</T>}
    </button>
  )
}
