'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { POSTED_PARAM, withoutPosted } from '@/lib/posted-rules'

/** ?posted=<id>: scroll the new card into view and tint it once, then drop the param (A23). */
export function JustPosted() {
  const id = useSearchParams().get(POSTED_PARAM)
  useEffect(() => {
    if (!id) return
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const done = () => window.history.replaceState(null, '', withoutPosted(location.pathname, location.search, location.hash))
    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(id)}"]`)
      if (el) {
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' })
        el.classList.add('just-posted')
        setTimeout(() => el.classList.remove('just-posted'), 2600)
        done()
      } else if (++tries < 50) timer = setTimeout(tick, 100) // the list may still be streaming in
      else done()
    }
    tick()
    return () => clearTimeout(timer)
  }, [id])
  return null
}
