'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/**
 * '나도 써요' checkbox toggle. Marking a tool adds it to my profile and puts
 * me in the tool's people list (friends see it first).
 */
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
      toast.success(next ? tn('‘나도 써요’로 표시했어요 · 내 프로필에 보여요') : tn('‘나도 써요’를 해제했어요'))
      router.refresh()
    } catch (err) {
      setUsing(!next)
      setCount((c) => Math.max(0, c + (next ? -1 : 1)))
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      role="checkbox"
      onClick={toggle}
      disabled={busy}
      aria-checked={using}
      aria-label={using ? tx('나도 써요 (표시됨, 눌러서 해제)') : tx('나도 써요로 표시')}
      className={`usage-toggle ${using ? 'on' : ''} ${size === 'md' ? 'usage-toggle-md' : ''}`}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: 4,
          border: using ? '1.5px solid #fff' : '1.5px solid #9a9a9a',
          background: using ? '#fff' : 'transparent',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {using && <Check className="w-3 h-3" strokeWidth={3.2} style={{ color: '#111' }} />}
      </span>
      <span><T>나도 써요</T></span>
      {showCount && <span className="tabular-nums opacity-70">· {count}</span>}
    </button>
  )
}
