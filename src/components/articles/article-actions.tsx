'use client'

import { useState } from 'react'
import { Heart, MessageCircle, Pencil } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn } from '@/i18n/client'
import { articleEditHref } from '@/lib/article-rules'
import { SubscribeButton } from './subscribe-button'
import { ArchiveButton } from '@/components/archive/archive-button'

export function ArticleActions({
  articleId,
  seriesId,
  likeCount,
  commentCount,
  likedByMe,
  subscribed,
  isMine,
  signedIn,
  title,
  excerpt,
  slug,
}: {
  articleId: string
  seriesId: string | null
  likeCount: number
  commentCount: number
  likedByMe: boolean
  subscribed: boolean
  isMine: boolean
  signedIn: boolean
  title: string
  excerpt?: string | null
  slug: string
}) {
  const [liked, setLiked] = useState(likedByMe)
  const [likes, setLikes] = useState(likeCount)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (!signedIn) return
    if (isMine) return toast.error(tn('내 아티클은 좋아할 수 없어요.'))
    if (busy) return
    setBusy(true)
    const next = !liked
    const res = await fetch(`/api/articles/${articleId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ on: next }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return toast.error(data.error || tn('처리하지 못했어요.'))
    setLiked(Boolean(data.likedByMe))
    setLikes(Number(data.likeCount) || 0)
  }

  return (
    <div className="article-actions">
      <button type="button" className={`article-action ${liked ? 'on' : ''}`} onClick={() => void toggle()} disabled={!signedIn || busy} aria-pressed={liked} aria-label={tn('좋아요')}>
        <Heart className="w-4 h-4" fill={liked ? 'currentColor' : 'none'} />
        <span className="tabular-nums">{likes}</span>
      </button>
      <a href="#article-comments" className="article-action" aria-label={tn('댓글')}>
        <MessageCircle className="w-4 h-4" />
        <span className="tabular-nums">{commentCount}</span>
      </a>
      {seriesId && signedIn && !isMine && <SubscribeButton seriesId={seriesId} initial={subscribed} />}
      {signedIn && (
        <ArchiveButton kind="article" refId={articleId} hint={{ title, excerpt: excerpt ?? undefined, url: `/articles/${slug}` }} />
      )}
      {isMine && (
        <Link href={articleEditHref(slug)} className="btn btn-secondary btn-sm">
          <Pencil className="w-4 h-4" />
          <T>수정</T>
        </Link>
      )}
    </div>
  )
}
