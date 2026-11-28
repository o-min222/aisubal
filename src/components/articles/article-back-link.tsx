'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'
import { articleBackMode } from '@/lib/article-rules'

/**
 * A135: '< 목록' (same pattern as '< 관리'). A real link to /articles, so open-in-new-tab and
 * long-press work; a plain click goes history-back when the reader came from inside the app.
 */
export function ArticleBackLink() {
  const router = useRouter()
  return (
    <Link
      href="/articles"
      className="article-back"
      aria-label={tx('아티클 목록으로 돌아가기')}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        if (articleBackMode(document.referrer, window.location.origin) === 'back' && window.history.length > 1) {
          e.preventDefault()
          router.back()
        }
      }}
    >
      <ChevronLeft className="w-4 h-4" aria-hidden /> <T>목록</T>
    </Link>
  )
}
