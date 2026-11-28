'use client'

import { Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { articleHref } from '@/lib/article-rules'
import { postShareData, shareClipboardText } from '@/lib/share-rules'

/**
 * A140: share an article. Native share sheet where there is one, else copy the link. The shared link is the
 * public article URL: non-members read a preview there and are asked to join for the rest. `teaser` is the article
 * title only when the server says it is safe for link previews (article_share_preview).
 */
export function ArticleShareButton({ slug, teaser, variant = 'icon' }: { slug: string; teaser?: string | null; variant?: 'icon' | 'pill' }) {
  async function share() {
    const url = new URL(articleHref(slug), window.location.origin).toString()
    try {
      if (navigator.share) await navigator.share(postShareData(url, teaser))
      else {
        await navigator.clipboard.writeText(shareClipboardText(url, teaser))
        toast.success(tn('링크를 복사했어요'))
      }
    } catch {
      /* cancelled, or clipboard blocked */
    }
  }
  if (variant === 'pill') {
    return (
      <button type="button" className="article-action" onClick={() => void share()} aria-label={tx('공유')}>
        <Share2 className="w-4 h-4" />
        <span><T>공유</T></span>
      </button>
    )
  }
  return (
    <button type="button" className="article-share-icon" onClick={() => void share()} aria-label={tx('공유')} title={tx('공유')}>
      <Share2 className="w-4 h-4" />
    </button>
  )
}
