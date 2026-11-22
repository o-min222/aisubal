'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/i18n/client'

/**
 * Horizontal tab strip that never hides tabs silently: the active tab is
 * scrolled into view, and an edge fade + chevron shows (and pages to) the rest.
 */
export function TabScroller({ label, className = '', style, children }: { label: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  const t = useT()
  const ref = useRef<HTMLElement>(null)
  const [edge, setEdge] = useState({ l: false, r: false })
  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]')
    if (active && nav.scrollWidth > nav.clientWidth) {
      const left = active.offsetLeft - nav.offsetLeft
      if (left < nav.scrollLeft || left + active.offsetWidth > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = left - (nav.clientWidth - active.offsetWidth) / 2
    }
    const sync = () => setEdge({ l: nav.scrollLeft > 2, r: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 2 })
    sync()
    nav.addEventListener('scroll', sync, { passive: true })
    const ro = new ResizeObserver(sync)
    ro.observe(nav)
    return () => {
      nav.removeEventListener('scroll', sync)
      ro.disconnect()
    }
  }, [])
  const page = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.7, behavior: 'smooth' })
  return (
    <div className="tabs-scroll">
      <nav ref={ref} aria-label={label} className={className} style={style}>
        {children}
      </nav>
      {edge.l && (
        <button type="button" className="tabs-more tabs-more-l" aria-label={t('이전 탭 더 보기')} onClick={() => page(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}
      {edge.r && (
        <button type="button" className="tabs-more tabs-more-r" aria-label={t('다음 탭 더 보기')} onClick={() => page(1)}>
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  )
}
