'use client'

import { useCallback, useTransition, type MouseEvent } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { REFRESH_EVENT } from '@/components/shell/pull-to-refresh'

/** Re-tapping the active tab/logo: smooth-scroll to top (if needed) and refresh, same as pull-to-refresh. */
function refreshAndScrollToTop(refresh: () => void) {
  if (typeof window === 'undefined') return
  if (window.scrollY > 4) window.scrollTo({ top: 0, behavior: 'smooth' })
  refresh()
  window.dispatchEvent(new Event(REFRESH_EVENT))
}

/**
 * When a nav link points at the page already on screen, consume the click, scroll to the top,
 * and refresh so new items show. A subpage (e.g. /posts/x while 홈 is highlighted) still navigates
 * to the tab root. Modifier/middle clicks stay normal.
 */
export function useRetapNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  const retap = useCallback(() => {
    refreshAndScrollToTop(() => startTransition(() => router.refresh()))
  }, [router])

  const onRetap = useCallback(
    (href: string, e: MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      if (pathname !== href) return
      e.preventDefault()
      retap()
    },
    [pathname, retap],
  )

  return { pathname, retap, onRetap }
}
