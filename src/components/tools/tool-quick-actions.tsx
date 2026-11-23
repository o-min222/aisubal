'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { tn, tx } from '@/i18n/client'

/**
 * A49: one-tap 좋아요 and 나도 써요 (with counts) for gallery rows and the panel header.
 * Optimistic; a tap never opens the panel (the buttons sit beside the row link, and swallow the click).
 */
export function ToolQuickActions({
  entryId,
  name,
  liked: initialLiked,
  likeCount: initialLikes,
  using: initialUsing,
  useCount: initialUses,
  variant = 'row',
}: {
  entryId: string
  name: string
  liked: boolean
  likeCount: number
  using: boolean
  useCount: number
  variant?: 'row' | 'header'
}) {
  const router = useRouter()
  const [liked, setLiked] = useState(initialLiked)
  const [likes, setLikes] = useState(initialLikes)
  const [using, setUsing] = useState(initialUsing)
  const [uses, setUses] = useState(initialUses)
  const [busy, setBusy] = useState<'like' | 'use' | null>(null)

  async function toggle(kind: 'like' | 'use', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (busy) return
    const on = kind === 'like' ? !liked : !using
    const setOn = kind === 'like' ? setLiked : setUsing
    const setN = kind === 'like' ? setLikes : setUses
    setBusy(kind)
    setOn(on)
    setN((n) => Math.max(0, n + (on ? 1 : -1)))
    try {
      const res = await fetch(`/api/tools/${entryId}/${kind === 'like' ? 'like' : 'usage'}`, { method: on ? 'POST' : 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      const n = kind === 'like' ? data.likeCount : data.userCount
      if (typeof n === 'number') setN(n)
      if (kind === 'use') toast.success(on ? tn('‘나도 써요’로 표시했어요 · 내 프로필에 보여요') : tn('‘나도 써요’를 해제했어요'))
      router.refresh()
    } catch (err) {
      setOn(!on)
      setN((n) => Math.max(0, n + (on ? -1 : 1)))
      toast.error(err instanceof Error ? err.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(null)
    }
  }

  const header = variant === 'header'
  return (
    <span className={`qa ${header ? 'qa-header' : 'qa-row'}`}>
      <button
        type="button"
        className={`qa-btn qa-like${liked ? ' on' : ''}`}
        aria-pressed={liked}
        aria-label={liked ? tx('{name} 좋아요 취소', { name }) : tx('{name} 좋아요', { name })}
        title={tx('좋아요')}
        onClick={(e) => toggle('like', e)}
      >
        <Heart className="qa-ic" aria-hidden />
        <span className="tabular-nums">{likes}</span>
      </button>
      <button
        type="button"
        className={`qa-btn qa-use${using ? ' on' : ''}`}
        aria-pressed={using}
        aria-label={using ? tx('나도 써요 (표시됨, 눌러서 해제)') : tx('나도 써요로 표시')}
        title={using ? tx('사용 중') : tx('나도 써요')}
        onClick={(e) => toggle('use', e)}
      >
        <Check className="qa-ic" aria-hidden />
        {header && <span>{using ? tx('사용 중') : tx('나도 써요')}</span>}
        <span className="tabular-nums">{uses}</span>
      </button>
    </span>
  )
}
