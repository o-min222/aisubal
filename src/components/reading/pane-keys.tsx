'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Esc closes the reading pane. On narrow screens the push view starts at its top. */
export function PaneKeys({ closeHref }: { closeHref: string }) {
  const router = useRouter()
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      router.push(closeHref, { scroll: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeHref, router])
  return null
}
