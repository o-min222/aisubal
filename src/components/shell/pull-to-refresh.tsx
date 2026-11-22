'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { tx } from '@/i18n/client'
import { pullProgress, PULL_THRESHOLD } from '@/lib/pull-refresh'

export const REFRESH_EVENT = 'aisubal:refreshed'

/**
 * Phones (touch, < 768px): pull down from the very top of the page to refresh the current
 * screen (router.refresh: server data re-fetched, client state kept). Native pull-to-refresh is
 * off (html overscroll-behavior-y: none), so this is the only one. Ignores pulls that start in
 * sheets/dialogs, text fields, or horizontal scrollers, and when the page isn't at the top.
 */
export function PullToRefresh() {
  const router = useRouter()
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pending, startTransition] = useTransition()
  const g = useRef<{ y: number; x: number; on: boolean; decided: boolean } | null>(null)
  const pullRef = useRef(0)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px) and (pointer: coarse)')
    const blocked = (t: EventTarget | null) => {
      const el = t instanceof Element ? t : null
      if (!el) return true
      if (el.closest('[role=dialog], [data-slot=sheet-content], textarea, input, select, [contenteditable=true], .gsearch-pop, [data-no-pull]')) return true
      // inside a scrolled inner container
      for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
        if (n.scrollTop > 0) return true
      }
      return document.body.hasAttribute('data-scroll-locked') || document.body.style.overflow === 'hidden'
    }
    const start = (e: TouchEvent) => {
      if (!mq.matches || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target)) return (g.current = null)
      g.current = { y: e.touches[0].clientY, x: e.touches[0].clientX, on: false, decided: false }
    }
    const move = (e: TouchEvent) => {
      const s = g.current
      if (!s) return
      const dy = e.touches[0].clientY - s.y
      const dx = e.touches[0].clientX - s.x
      if (!s.decided && (Math.abs(dy) > 8 || Math.abs(dx) > 8)) {
        s.decided = true
        s.on = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 && window.scrollY <= 0
        if (!s.on) return (g.current = null)
      }
      if (s.on) {
        pullRef.current = Math.max(0, dy)
        setPull(pullRef.current)
      }
    }
    const end = () => {
      const s = g.current
      g.current = null
      if (!s?.on) return
      const done = pullProgress(pullRef.current) >= 1
      pullRef.current = 0
      setPull(0)
      if (!done) return
      setBusy(true)
      startTransition(() => router.refresh())
      window.dispatchEvent(new Event(REFRESH_EVENT))
      setTimeout(() => setBusy(false), 450)
    }
    window.addEventListener('touchstart', start, { passive: true })
    window.addEventListener('touchmove', move, { passive: true })
    window.addEventListener('touchend', end)
    window.addEventListener('touchcancel', end)
    return () => {
      window.removeEventListener('touchstart', start)
      window.removeEventListener('touchmove', move)
      window.removeEventListener('touchend', end)
      window.removeEventListener('touchcancel', end)
    }
  }, [router])

  const spinning = busy || pending
  const p = spinning ? 1 : pullProgress(pull)
  if (!spinning && pull <= 0) return null
  const offset = spinning ? PULL_THRESHOLD * 0.6 : Math.min(pull * 0.5, PULL_THRESHOLD * 0.9)
  return (
    <div className="ptr" style={{ transform: `translate(-50%, ${offset}px)`, opacity: Math.min(1, 0.3 + p) }} role="status" aria-live="polite" aria-label={spinning ? tx('새로고침 중') : tx('당겨서 새로고침')}>
      <RefreshCw className={`w-[18px] h-[18px]${spinning ? ' animate-spin' : ''}`} style={spinning ? undefined : { transform: `rotate(${p * 270}deg)` }} />
    </div>
  )
}
