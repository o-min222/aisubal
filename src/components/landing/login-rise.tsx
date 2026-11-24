'use client'

import { useEffect } from 'react'

/**
 * AI-3 (A65c): on mobile the login section floats up as it scrolls into view. The server HTML is
 * fully visible; this only hides the section while it is still off-screen, so a failed script or an
 * observer that never fires can't leave the login hidden. Reduced motion → nothing happens.
 */
export function LoginRise() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.landing')
    const login = document.getElementById('login')
    if (!root || !login) return
    if (!window.matchMedia('(max-width: 1023px)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (typeof IntersectionObserver === 'undefined') return
    const inView = (ratio: number) => {
      const r = login.getBoundingClientRect()
      return r.top < window.innerHeight * (1 - ratio) && r.bottom > 0
    }
    // already on screen (fast scroll before hydration, /#login): leave it as is
    if (inView(0)) return

    root.classList.add('rise-ready')
    let risen = false
    const rise = () => {
      if (risen) return
      risen = true
      requestAnimationFrame(() => root.classList.add('risen'))
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.2) rise()
          // the peek dims a little while the login is the main thing on screen
          root.classList.toggle('login-in-view', e.intersectionRatio >= 0.5)
        }
      },
      { threshold: [0, 0.2, 0.5] }
    )
    io.observe(login)
    // backup for a missed observer callback
    const onScroll = () => { if (inView(0.2)) rise() }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      window.removeEventListener('scroll', onScroll)
      root.classList.remove('rise-ready', 'risen', 'login-in-view')
    }
  }, [])
  return null
}
