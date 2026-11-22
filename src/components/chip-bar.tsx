'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * The one horizontal chip row (filters, categories, tags): never wraps or
 * clips, scrolls sideways with fade edges that show only when there's more.
 */
export function ChipBar({
  children,
  label,
  as = 'nav',
  role,
  className = '',
}: {
  children: ReactNode
  label?: string
  as?: 'nav' | 'div'
  role?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState({ l: false, r: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setFade({ l: el.scrollLeft > 2, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 })
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    // keep the selected chip in view
    const sel = el.querySelector<HTMLElement>('.on, [aria-checked="true"], [aria-selected="true"], [aria-current="page"]')
    if (sel && sel.offsetLeft + sel.offsetWidth > el.clientWidth) el.scrollLeft = sel.offsetLeft - 24
    return () => {
      el.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [])
  const Tag = as
  return (
    <div className={`chip-bar${fade.l ? ' fade-l' : ''}${fade.r ? ' fade-r' : ''} ${className}`}>
      <Tag ref={ref} className="chip-bar-track" aria-label={label} role={role}>
        {children}
      </Tag>
    </div>
  )
}
