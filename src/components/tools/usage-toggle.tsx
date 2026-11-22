'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Plus } from 'lucide-react'
import { toast } from 'sonner'

/** '사용 중' toggle (members mark the tools they use; shown on their profile). */
export function UsageToggle({
  entryId,
  initialUsing,
  initialCount,
  size = 'sm',
  showCount = false,
}: {
  entryId: string
  initialUsing: boolean
  initialCount?: number
  size?: 'sm' | 'md'
  showCount?: boolean
}) {
  const router = useRouter()
  const [using, setUsing] = useState(initialUsing)
  const [count, setCount] = useState(initialCount ?? 0)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const next = !using
    setBusy(true)
    setUsing(next)
    setCount((c) => Math.max(0, c + (next ? 1 : -1)))
    try {
      const res = await fetch(`/api/tools/${entryId}/usage`, { method: next ? 'POST' : 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '처리하지 못했어요.')
      if (typeof data.userCount === 'number') setCount(data.userCount)
      toast.success(next ? '내가 쓰는 툴에 추가했어요' : '내가 쓰는 툴에서 뺐어요')
      router.refresh()
    } catch (err) {
      setUsing(!next)
      setCount((c) => Math.max(0, c + (next ? -1 : 1)))
      toast.error(err instanceof Error ? err.message : '처리하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={using}
      className={`usage-toggle ${using ? 'on' : ''} ${size === 'md' ? 'usage-toggle-md' : ''}`}
    >
      {using ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
      <span>{using ? '사용 중' : '사용 중 표시'}</span>
      {showCount && <span className="tabular-nums opacity-70">· {count}</span>}
    </button>
  )
}
