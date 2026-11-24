'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

/**
 * Horizontal tab strip: scrolls sideways when the tabs don't fit, with the active tab scrolled into view.
 * A84: no edge fade or chevron buttons — the strip clips naturally at its edge.
 */
export function TabScroller({ label, className = '', style, children }: { label: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (active && nav.scrollWidth > nav.clientWidth) {
      const left = active.offsetLeft - nav.offsetLeft
      if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = left - (nav.clientWidth - active.offsetWidth) / 2
    }
  }, [])
  return (
    <div className="tabs-scroll">
      <nav ref={ref} aria-label={label} className={className} style={style}>
        {children}
      </nav>
    </div>
  )
}
