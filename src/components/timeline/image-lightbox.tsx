'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { tx } from '@/i18n/client'

function blockMenu(e: { preventDefault: () => void }) {
  e.preventDefault()
}

/** A115: view-only image on a post thread. Pinch/wheel zoom; close with X, backdrop/image tap, swipe down, or Esc. */
export function ImageLightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean; pinch: number | null } | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const scaleRef = useRef(1)
  const moved = useRef(false)
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  const close = useCallback(() => onClose(), [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('img-lb-open')
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.body.classList.remove('img-lb-open')
      window.removeEventListener('keydown', onKey)
    }
  }, [close])

  function onPointerDown(e: React.PointerEvent) {
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) {
      drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false, pinch: null }
      moved.current = false
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      drag.current = { x: 0, y: 0, px: pan.x, py: pan.y, moved: true, pinch: Math.hypot(a.x - b.x, a.y - b.y) }
      moved.current = true
    }
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const d = drag.current
    if (!d) return
    if (pointers.current.size === 2 && d.pinch) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const next = Math.min(4, Math.max(1, scaleRef.current * (dist / d.pinch)))
      d.pinch = dist
      d.moved = true
      moved.current = true
      setScale(next)
      return
    }
    if (pointers.current.size === 1) {
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        d.moved = true
        moved.current = true
      }
      if (scaleRef.current > 1) setPan({ x: d.px + dx, y: d.py + dy })
    }
  }
  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId)
    const d = drag.current
    if (pointers.current.size === 0) {
      drag.current = null
      if (d && !d.moved && scaleRef.current <= 1) close()
      else if (d && scaleRef.current <= 1 && d.moved) {
        const dy = e.clientY - d.y
        if (dy > 80) close()
      }
      if (scaleRef.current <= 1) setPan({ x: 0, y: 0 })
    }
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    const next = Math.min(4, Math.max(1, scaleRef.current * (e.deltaY < 0 ? 1.12 : 0.9)))
    setScale(next)
    if (next <= 1) setPan({ x: 0, y: 0 })
  }

  const node = (
    <div
      className="img-lb"
      role="dialog"
      aria-modal="true"
      aria-label={tx('이미지 크게 보기')}
      onContextMenu={blockMenu}
      onClick={(e) => {
        if (e.target === e.currentTarget) close()
      }}
    >
      <button type="button" className="img-lb-x" onClick={close} aria-label={tx('이미지 보기 닫기')}>
        <X className="w-5 h-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className="img-lb-img"
        draggable={false}
        onContextMenu={blockMenu}
        onDragStart={blockMenu}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
      />
    </div>
  )
  return createPortal(node, document.body)
}

export function ExpandableImage({
  src,
  className,
  alt = '',
}: {
  src: string
  className?: string
  alt?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" className="tc-image-open" onClick={() => setOpen(true)} aria-label={tx('이미지 크게 보기')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={className}
          draggable={false}
          onContextMenu={blockMenu}
          onDragStart={blockMenu}
        />
      </button>
      {open ? <ImageLightbox src={src} onClose={() => setOpen(false)} /> : null}
    </>
  )
}
