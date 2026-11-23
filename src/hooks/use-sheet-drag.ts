'use client'

import { useCallback, useEffect, useRef } from 'react'

/** Past either of these the sheet closes on release; otherwise it snaps back. */
export const SHEET_CLOSE_DISTANCE = 120 // px, or 30% of the sheet if that is smaller
export const SHEET_CLOSE_VELOCITY = 0.5 // px/ms over the last ~100ms

export function shouldCloseSheet(dy: number, velocity: number, height: number): boolean {
  if (dy <= 0) return false
  return dy >= Math.min(SHEET_CLOSE_DISTANCE, height * 0.3) || (velocity >= SHEET_CLOSE_VELOCITY && dy > 12)
}

/** Is any scrollable ancestor between the touch target and the sheet scrolled away from its top? */
function scrolledAboveTop(target: EventTarget | null, sheet: HTMLElement): boolean {
  let el = target instanceof Element ? (target as HTMLElement) : null
  while (el) {
    if (el.scrollTop > 0) return true
    if (el === sheet) return false
    el = el.parentElement
  }
  return false
}

/**
 * A45: drag a bottom sheet down to close it. The sheet follows the finger; it closes past a
 * distance/velocity threshold, else snaps back. Drag starts from the grab area ([data-sheet-grab])
 * anywhere, or from the content while it's scrolled to the top. Touch events (not pointer events)
 * so a drag that starts in the content can take over from scrolling on iOS.
 * Returns a callback ref for the sheet element.
 */
export function useSheetDrag(onClose: () => void) {
  const cleanup = useRef<(() => void) | null>(null)
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  return useCallback((sheet: HTMLElement | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!sheet) return

    let startY = 0
    let dy = 0
    let armed = false // may become a drag (grab area, or content at the top)
    let dragging = false
    let samples: { y: number; t: number }[] = []

    const setY = (y: number, animate: boolean) => {
      sheet.style.transition = animate ? 'transform .22s cubic-bezier(.2,.8,.2,1)' : 'none'
      sheet.style.transform = y > 0 ? `translate3d(0, ${y}px, 0)` : ''
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { armed = false; return }
      const t = e.target as Element | null
      if (t?.closest('input, textarea, select, [contenteditable="true"], [data-sheet-nodrag]')) { armed = false; return }
      const fromGrab = Boolean(t?.closest('[data-sheet-grab]'))
      armed = fromGrab || !scrolledAboveTop(e.target, sheet)
      dragging = false
      startY = e.touches[0].clientY
      dy = 0
      samples = [{ y: startY, t: e.timeStamp }]
    }

    const onMove = (e: TouchEvent) => {
      if (!armed) return
      const y = e.touches[0].clientY
      const d = y - startY
      if (!dragging) {
        if (d < -4) { armed = false; return } // scrolling up: leave it to the content
        if (d < 6) return
        dragging = true
      }
      if (e.cancelable) e.preventDefault()
      dy = Math.max(0, d)
      samples.push({ y, t: e.timeStamp })
      if (samples.length > 6) samples.shift()
      setY(dy, false)
    }

    const onEnd = (e: TouchEvent) => {
      if (!dragging) { armed = false; return }
      dragging = false
      armed = false
      const now = e.timeStamp
      const recent = samples.filter((s) => now - s.t <= 100)
      const first = recent[0] ?? samples[0]
      const last = samples[samples.length - 1]
      const v = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
      if (shouldCloseSheet(dy, v, sheet.offsetHeight)) {
        setY(sheet.offsetHeight + 24, true)
        window.setTimeout(() => closeRef.current(), 180)
      } else {
        setY(0, true)
      }
    }

    sheet.addEventListener('touchstart', onStart, { passive: true })
    sheet.addEventListener('touchmove', onMove, { passive: false })
    sheet.addEventListener('touchend', onEnd)
    sheet.addEventListener('touchcancel', onEnd)
    cleanup.current = () => {
      sheet.removeEventListener('touchstart', onStart)
      sheet.removeEventListener('touchmove', onMove)
      sheet.removeEventListener('touchend', onEnd)
      sheet.removeEventListener('touchcancel', onEnd)
    }
  }, [])
}
