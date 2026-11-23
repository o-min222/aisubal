'use client'

import { useState } from 'react'
import { idFromLikeEndpoint, publishLike, useCounts, type Counts } from '@/lib/count-store'
import { Heart } from 'lucide-react'
import { toast } from 'sonner'
import { tx, tn } from '@/i18n/client'

/**
 * Heart + count. POST/DELETE `endpoint` toggles the viewer's like.
 * Clicking the count opens the liker list (onShowLikers).
 */
export function LikeButton({
  endpoint,
  initialLiked,
  initialCount,
  disabled,
  self,
  onShowLikers,
}: {
  endpoint: string
  initialLiked: boolean
  initialCount: number
  disabled?: boolean
  /** viewer's own post: count + liker list only, no heart */
  self?: boolean
  onShowLikers?: () => void
}) {
  const postId = idFromLikeEndpoint(endpoint)
  // replies don't matter here; the store keeps every view of this post in step
  const synced = useCounts(postId, { likeCount: initialCount, liked: initialLiked, replyCount: 0 })
  const [busy, setBusy] = useState(false)
  // this button's own optimistic value: shown while its request runs, then until the store moves past `base`
  const [mine, setMine] = useState<{ liked: boolean; count: number; base: Pick<Counts, 'liked' | 'likeCount'> } | null>(null)
  const own = mine && (busy || (mine.base.liked === synced.liked && mine.base.likeCount === synced.likeCount)) ? mine : null
  const liked = own ? own.liked : synced.liked
  const count = own ? own.count : synced.likeCount

  async function toggle() {
    if (busy || disabled || self) return
    const next = !liked
    setBusy(true)
    setMine({ liked: next, count: Math.max(0, count + (next ? 1 : -1)), base: { liked: synced.liked, likeCount: synced.likeCount } })
    try {
      const res = await fetch(endpoint, { method: next ? 'POST' : 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '좋아요 실패')
      if (typeof data.likeCount === 'number') {
        setMine((m) => m && { ...m, count: data.likeCount })
        if (postId) publishLike(postId, data.likeCount, next)
      }
    } catch (e) {
      setMine(null)
      toast.error(e instanceof Error ? e.message : tn('좋아요 실패'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled || busy || self}
        aria-pressed={liked}
        aria-label={self ? tx('내 글에는 좋아요를 누를 수 없어요') : liked ? tx('좋아요 취소') : tx('좋아요')}
        title={self ? tx('내 글에는 좋아요를 누를 수 없어요') : undefined}
        className={`tap-target inline-flex items-center justify-center rounded-full transition-colors active:scale-90 ${
          liked ? 'text-c-e0245e hover:bg-c-fde8ef' : 'text-n-666 hover:bg-tint-hover hover:text-c-e0245e'
        } disabled:opacity-60`}
      >
        <Heart className={`w-[18px] h-[18px] ${liked ? 'fill-current' : ''}`} />
      </button>
      <button
        type="button"
        onClick={onShowLikers}
        disabled={!onShowLikers || count === 0}
        className="min-w-[28px] min-h-[44px] md:min-h-0 text-left text-sm text-n-555 hover:text-n-111 disabled:cursor-default tabular-nums"
        aria-label={tx('좋아요한 사람 보기')}
      >
        {count}
      </button>
    </span>
  )
}
