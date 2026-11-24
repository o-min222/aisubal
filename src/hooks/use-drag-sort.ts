'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

/** touch: hold this long (without moving) to pick an item up */
export const LONG_PRESS_MS = 250
/** touch: moving farther than this before the long-press means a scroll */
const TOUCH_SLOP = 8
/** mouse/pen: drag starts after this many px (so a click stays a click) */
const MOUSE_SLOP = 5
/** auto-scroll zones from the viewport edges (the bottom one clears the mobile tab bar) */
const EDGE_TOP = 72
const EDGE_BOTTOM = 104

type Drag = {
  idx: number
  x: number
  y: number
  px: number
  py: number
  gx: number
  gy: number
  touch: boolean
  active: boolean
  timer: ReturnType<typeof setTimeout> | null
  skip: Element | null
  raf: number | null
}

/**
 * A90/A94: drag-to-reorder for a short list (profile chips, '내가 쓰는 것').
 * - Mouse/pen: drag the item (5px threshold).
 * - Touch: long-press (~250ms) lifts it (vibrates where supported); before that, a swipe scrolls
 *   the page as usual. While lifted the page doesn't scroll, the item follows the finger, the others
 *   slide out of the way (FLIP), and the page auto-scrolls near the top/bottom edge.
 * - Keyboard: arrow keys on a focused item move it.
 * Items carry data-sort-list / data-sort-idx; onMove reorders live, onDrop saves once.
 */
export function useDragSort(list: string, onMove: (from: number, to: number) => void, onDrop: () => void) {
  const st = useRef<Drag | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const droppedAt = useRef(0)
  const cb = useRef({ onMove, onDrop })
  useEffect(() => { cb.current = { onMove, onDrop } })

  useEffect(() => {
    const sel = (i?: number) => (i === undefined ? `[data-sort-list="${list}"]` : `[data-sort-list="${list}"][data-sort-idx="${i}"]`)
    const lifted = (s: Drag) => document.querySelector<HTMLElement>(sel(s.idx))

    // keep the lifted item under the finger / cursor (its layout slot moves as the list reorders)
    const place = (s: Drag) => {
      const el = lifted(s)
      if (!el) return
      el.style.transition = 'none'
      el.style.transform = ''
      const r = el.getBoundingClientRect()
      el.style.transform = `translate(${s.px - s.gx - r.left}px, ${s.py - s.gy - r.top}px)`
    }

    // which item's layout slot is under the pointer: its rect minus any in-flight FLIP translate,
    // so a chip still gliding to its new place isn't hit where it was a moment ago
    const slotAt = (s: Drag, me: HTMLElement | null) => {
      for (const e of document.querySelectorAll<HTMLElement>(sel())) {
        if (e === me) continue
        const r = e.getBoundingClientRect()
        const t = getComputedStyle(e).transform
        const m = t && t !== 'none' ? new DOMMatrixReadOnly(t) : null
        const left = r.left - (m?.m41 ?? 0)
        const top = r.top - (m?.m42 ?? 0)
        if (s.px >= left && s.px <= left + r.width && s.py >= top && s.py <= top + r.height) return e
      }
      return null
    }

    const swapUnder = (s: Drag) => {
      const me = lifted(s)
      const hit = slotAt(s, me)
      if (!hit) { s.skip = null; return }
      if (hit === s.skip) return // just traded places with it: wait until the pointer leaves it
      const to = Number(hit.dataset.sortIdx)
      if (Number.isNaN(to) || to === s.idx) { s.skip = null; return }
      const before = new Map<HTMLElement, DOMRect>()
      document.querySelectorAll<HTMLElement>(sel()).forEach((e) => { if (e !== me) before.set(e, e.getBoundingClientRect()) })
      const from = s.idx
      s.idx = to
      s.skip = hit
      flushSync(() => {
        cb.current.onMove(from, to)
        setDragIdx(to)
      })
      // FLIP: the others glide from where they were to their new slot
      before.forEach((r, e) => {
        const n = e.getBoundingClientRect()
        const dx = r.left - n.left
        const dy = r.top - n.top
        if (!dx && !dy) return
        e.style.transition = 'none'
        e.style.transform = `translate(${dx}px, ${dy}px)`
        void e.offsetWidth
        e.style.transition = 'transform 160ms ease'
        e.style.transform = ''
      })
    }

    const frame = () => {
      const s = st.current
      if (!s?.active) return
      const vh = window.innerHeight
      const up = EDGE_TOP - s.py
      const down = s.py - (vh - EDGE_BOTTOM)
      if (up > 0) window.scrollBy(0, -Math.ceil((Math.min(up, EDGE_TOP) / EDGE_TOP) * 14))
      else if (down > 0) window.scrollBy(0, Math.ceil((Math.min(down, EDGE_BOTTOM) / EDGE_BOTTOM) * 14))
      swapUnder(s)
      place(s)
      s.raf = requestAnimationFrame(frame)
    }

    const lift = (s: Drag) => {
      const el = lifted(s)
      if (!el) return
      const r = el.getBoundingClientRect()
      s.gx = s.x - r.left
      s.gy = s.y - r.top
      s.active = true
      el.dataset.lifted = ''
      document.body.classList.add('is-sorting')
      if (s.touch) navigator.vibrate?.(12)
      setDragIdx(s.idx)
      s.raf = requestAnimationFrame(frame)
    }

    const end = (commit: boolean) => {
      const s = st.current
      st.current = null
      if (!s) return
      if (s.timer) clearTimeout(s.timer)
      if (!s.active) return
      if (s.raf) cancelAnimationFrame(s.raf)
      const el = lifted(s)
      if (el) {
        delete el.dataset.lifted
        el.style.transition = 'transform 140ms ease'
        el.style.transform = ''
      }
      document.body.classList.remove('is-sorting')
      setDragIdx(null)
      droppedAt.current = performance.now()
      if (commit) cb.current.onDrop()
    }

    // ---- mouse / pen
    const pmove = (e: PointerEvent) => {
      const s = st.current
      if (!s || s.touch) return
      s.px = e.clientX
      s.py = e.clientY
      if (!s.active && Math.hypot(e.clientX - s.x, e.clientY - s.y) >= MOUSE_SLOP) lift(s)
      if (s.active) e.preventDefault()
    }
    const pup = () => { if (st.current && !st.current.touch) end(true) }

    // ---- touch
    const tmove = (e: TouchEvent) => {
      const s = st.current
      if (!s?.touch) return
      const t = e.touches[0]
      if (!t) return
      if (!s.active) {
        // moved before the long-press: it's a scroll, let the browser have it
        if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > TOUCH_SLOP) end(false)
        return
      }
      e.preventDefault() // lifted: the page must not scroll under the finger
      s.px = t.clientX
      s.py = t.clientY
    }
    const tend = (e: TouchEvent) => {
      const s = st.current
      if (!s?.touch) return
      if (s.active && e.cancelable) e.preventDefault() // no click after a drop
      end(e.type === 'touchend')
    }
    const noMenu = (e: Event) => { if (st.current?.touch) e.preventDefault() }

    document.addEventListener('pointermove', pmove, { passive: false })
    document.addEventListener('pointerup', pup)
    document.addEventListener('pointercancel', pup)
    document.addEventListener('touchmove', tmove, { passive: false })
    document.addEventListener('touchend', tend, { passive: false })
    document.addEventListener('touchcancel', tend)
    document.addEventListener('contextmenu', noMenu)
    const startTouch = (e: Event) => {
      const d = (e as CustomEvent<{ idx: number; x: number; y: number }>).detail
      const s: Drag = { idx: d.idx, x: d.x, y: d.y, px: d.x, py: d.y, gx: 0, gy: 0, touch: true, active: false, timer: null, skip: null, raf: null }
      s.timer = setTimeout(() => { if (st.current === s) lift(s) }, LONG_PRESS_MS)
      st.current = s
    }
    const startMouse = (e: Event) => {
      const d = (e as CustomEvent<{ idx: number; x: number; y: number }>).detail
      st.current = { idx: d.idx, x: d.x, y: d.y, px: d.x, py: d.y, gx: 0, gy: 0, touch: false, active: false, timer: null, skip: null, raf: null }
    }
    const tk = `sort-touch:${list}`
    const mk = `sort-mouse:${list}`
    document.addEventListener(tk, startTouch)
    document.addEventListener(mk, startMouse)
    return () => {
      end(false)
      document.removeEventListener('pointermove', pmove)
      document.removeEventListener('pointerup', pup)
      document.removeEventListener('pointercancel', pup)
      document.removeEventListener('touchmove', tmove)
      document.removeEventListener('touchend', tend)
      document.removeEventListener('touchcancel', tend)
      document.removeEventListener('contextmenu', noMenu)
      document.removeEventListener(tk, startTouch)
      document.removeEventListener(mk, startMouse)
    }
  }, [list])

  /** spread on each item */
  const item = useCallback(
    (idx: number) => ({
      'data-sort-list': list,
      'data-sort-idx': idx,
      onTouchStart: (e: React.TouchEvent) => {
        if (e.touches.length !== 1 || (e.target as Element).closest('[data-sort-ignore]')) return
        const t = e.touches[0]
        document.dispatchEvent(new CustomEvent(`sort-touch:${list}`, { detail: { idx, x: t.clientX, y: t.clientY } }))
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'touch' || e.button !== 0 || (e.target as Element).closest('[data-sort-ignore]')) return
        document.dispatchEvent(new CustomEvent(`sort-mouse:${list}`, { detail: { idx, x: e.clientX, y: e.clientY } }))
      },
      // keyboard: arrow keys move the focused item (no visible buttons)
      onKeyDown: (e: React.KeyboardEvent) => {
        const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : 0
        if (!d || e.altKey || e.ctrlKey || e.metaKey) return
        const n = document.querySelectorAll(`[data-sort-list="${list}"]`).length
        const to = idx + d
        if (to < 0 || to >= n) return
        e.preventDefault()
        flushSync(() => cb.current.onMove(idx, to))
        document.querySelector<HTMLElement>(`[data-sort-list="${list}"][data-sort-idx="${to}"] [data-sort-focus]`)?.focus()
        cb.current.onDrop()
      },
    }),
    [list],
  )
  /** true right after a drop: swallow the click that may follow */
  const wasDrag = () => performance.now() - droppedAt.current < 450
  return { item, dragIdx, wasDrag }
}
