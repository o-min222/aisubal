'use client'

import type { MouseEvent, PointerEvent } from 'react'
import { Share2 } from 'lucide-react'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { articleHref } from '@/lib/article-rules'
import { useShare } from '@/hooks/use-share'

/**
 * A140 / A142: share an article. Native share sheet where there is one, else copy the link. The shared
 * link is the public article URL: non-members read a preview there and are asked to join for the rest.
 * `teaser` is the article title only when the caller already treats it as safe for a link preview.
 * The click always stops, so a card that wraps this button does not open with it.
 */
export function ArticleShareButton({
  slug,
  teaser,
  variant = 'icon',
}: {
  slug: string
  teaser?: string | null
  variant?: 'icon' | 'pill' | 'feed'
}) {
  function stop(e: MouseEvent | PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
  }
  const shareLink = useShare()
  const share = () => shareLink(new URL(articleHref(slug), window.location.origin).toString(), teaser)
  const handlers = {
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      stop(e)
      void share()
    },
    onPointerDown: stop,
  }
  if (variant === 'pill') {
    return (
      <button type="button" className="article-action" {...handlers} aria-label={tx('공유')}>
        <Share2 className="w-4 h-4" />
        <span><T>공유</T></span>
      </button>
    )
  }
  if (variant === 'feed') {
    // A142: same 17px Share2 + tap-target as the share slot on a regular feed post
    return (
      <button
        type="button"
        className="article-feed-share tc-act tap-target inline-flex items-center justify-center rounded-full icon-btn"
        {...handlers}
        aria-label={tx('공유')}
        title={tx('공유')}
      >
        <Share2 className="w-[17px] h-[17px]" />
      </button>
    )
  }
  return (
    <button type="button" className="article-share-icon" {...handlers} aria-label={tx('공유')} title={tx('공유')}>
      <Share2 className="w-4 h-4" />
    </button>
  )
}
