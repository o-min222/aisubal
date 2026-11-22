'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

/**
 * Safety net: after every navigation, if no dialog/sheet is open, release any
 * scroll lock a sheet left behind (html/body overflow, pointer-events, Radix's
 * data-scroll-locked), so the page always scrolls again.
 */
export function ScrollLockGuard() {
  const pathname = usePathname()
  const search = useSearchParams()
  useEffect(() => {
    const t = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"][data-state="open"], [data-vaul-drawer][data-state="open"]')) return
      const html = document.documentElement
      const body = document.body
      if (html.style.overflow === 'hidden') html.style.overflow = ''
      if (body.style.overflow === 'hidden') body.style.overflow = ''
      if (body.style.pointerEvents === 'none') body.style.pointerEvents = ''
      body.removeAttribute('data-scroll-locked')
    }, 450)
    return () => window.clearTimeout(t)
  }, [pathname, search])
  return null
}
