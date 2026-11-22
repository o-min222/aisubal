'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { T } from '@/i18n/t'

/**
 * Long text in a timeline: clamp to a few lines with '더 보기'. Measured, so
 * short posts never show the button; the full text is one tap away in place.
 */
export function CollapsibleText({ children, lines = 8, className = '' }: { children: ReactNode; lines?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || open) return
    const check = () => setClamped(el.scrollHeight > el.clientHeight + 2)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [open, children])
  return (
    <>
      <div ref={ref} className={`${className}${open ? '' : ' collapse-text'}`} style={open ? undefined : { WebkitLineClamp: lines }}>
        {children}
      </div>
      {(clamped || open) && (
        <button
          type="button"
          className="more-toggle"
          aria-expanded={open}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen(!open)
          }}
        >
          {open ? <T>접기</T> : <T>더 보기</T>}
        </button>
      )}
    </>
  )
}
