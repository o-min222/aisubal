'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * A90: pointer drag-to-reorder for a short list (profile chips, '내가 쓰는 것').
 * Mouse/pen drag the item (5px threshold, so a click is still a click); touch drags only from
 * an element with data-sort-handle (its touch-action is none), so scrolling stays normal.
 * Items carry data-sort-list / data-sort-idx; the list reorders live and onDrop saves once.
 */
export function useDragSort(list: string, onMove: (from: number, to: number) => void, onDrop: () => void) {
  const st = useRef<{ idx: number; x: number; y: number; active: boolean; skip: Element | null } | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const justDragged = useRef(false)
  const cb = useRef({ onMove, onDrop })
  useEffect(() => { cb.current = { onMove, onDrop } })

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = st.current
      if (!s) return
      if (!s.active) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return
        s.active = true
        setDragIdx(s.idx)
        document.body.classList.add('is-sorting')
      }
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest(`[data-sort-list="${list}"]`) ?? null
      if (!el) return
      if (el === s.skip) return // just swapped with it: wait until the pointer leaves it
      const to = Number((el as HTMLElement).dataset.sortIdx)
      if (Number.isNaN(to) || to === s.idx) { s.skip = null; return }
      cb.current.onMove(s.idx, to)
      s.idx = to
      s.skip = el
      setDragIdx(to)
    }
    const up = () => {
      const s = st.current
      st.current = null
      if (!s?.active) return
      document.body.classList.remove('is-sorting')
      setDragIdx(null)
      justDragged.current = true
      setTimeout(() => { justDragged.current = false }, 0)
      cb.current.onDrop()
    }
    document.addEventListener('pointermove', move, { passive: false })
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
    }
  }, [list])

  /** spread on each item */
  const item = useCallback(
    (idx: number) => ({
      'data-sort-list': list,
      'data-sort-idx': idx,
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return
        const handle = (e.target as Element).closest('[data-sort-handle]')
        if (e.pointerType === 'touch' && !handle) return
        st.current = { idx, x: e.clientX, y: e.clientY, active: false, skip: null }
      },
    }),
    [list],
  )
  /** true right after a drag: swallow the click that follows pointerup */
  const wasDrag = () => justDragged.current
  return { item, dragIdx, wasDrag }
}
