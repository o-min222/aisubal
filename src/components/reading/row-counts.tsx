'use client'

import { Heart, MessageCircle } from 'lucide-react'
import { useCounts } from '@/lib/count-store'
import { tx } from '@/i18n/client'

/** ♥ / 💬 counts on a list row, kept in sync with likes and comments made in the pane (N-3). */
export function RowCounts({ id, likeCount, replyCount, liked }: { id: string; likeCount: number; replyCount: number; liked: boolean }) {
  const c = useCounts(id, { likeCount, replyCount, liked })
  return (
    <>
      <span aria-label={tx('좋아요 {likeCount}', { likeCount: c.likeCount })}>
        <Heart className={`w-3 h-3 ${c.liked ? 'fill-current text-c-e0245e' : ''}`} /> {c.likeCount}
      </span>
      <span aria-label={tx('답글 {replyCount}', { replyCount: c.replyCount })}>
        <MessageCircle className="w-3 h-3" /> {c.replyCount}
      </span>
    </>
  )
}
