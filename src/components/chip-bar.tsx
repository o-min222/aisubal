'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * The one horizontal chip row (filters, categories, tags): never wraps, scrolls sideways.
 * A84: no fade masks — the row clips naturally at its edge (the selected chip is scrolled into view).
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
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // keep the selected chip in view
    const sel = el.querySelector<HTMLElement>('.on, [aria-checked="true"], [aria-selected="true"], [aria-current="page"]')
    if (sel && sel.offsetLeft + sel.offsetWidth > el.clientWidth) el.scrollLeft = sel.offsetLeft - 24
  }, [])
  const Tag = as
  return (
    <div className={`chip-bar ${className}`}>
      <Tag ref={ref} className="chip-bar-track" aria-label={label} role={role}>
        {children}
      </Tag>
    </div>
  )
}
