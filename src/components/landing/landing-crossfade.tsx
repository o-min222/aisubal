'use client'

import { useEffect } from 'react'

/**
 * A65d/A65e: on mobile the login takes the peek's place on the same screen. The peek scrolls natively
 * (so it tracks the finger 1:1); once its bottom reaches the screen's bottom, the next TRAVEL of scroll
 * scrubs --p 0→1: the peek keeps moving up and dims under a fixed blur veil while the fixed login fades and
 * rises into the centre. Scrolling back reverses it.
 *
 * The server HTML is the plain stacked layout (peek, then the login below), which is also what
 * no-JS, reduced motion and PC get. Only this script switches to the stage (.xfade), so the hidden
 * state never ships in the HTML.
 */
const TRAVEL = 0.55 // × viewport height: the scroll (and so the peek's travel) for the whole crossfade
const LIVE_AT = 0.6 // the login takes taps from here; the peek stops taking them

export function LandingCrossfade() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.landing')
    const stage = root?.querySelector<HTMLElement>('.landing-stage')
    const peek = root?.querySelector<HTMLElement>('.landing-peek')
    const login = document.getElementById('login')
    const cue = root?.querySelector<HTMLAnchorElement>('.landing-cue')
    if (!root || !stage || !peek || !login) return
    const narrow = window.matchMedia('(max-width: 1023px)')
    const still = window.matchMedia('(prefers-reduced-motion: reduce)')

    let on = false
    let vh = 0
    let start = 0
    let travel = 0
    let raf = 0
    let lastP = -1
    let live = false

    // the small viewport (svh) height: stable while iOS toolbars show and hide
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;top:0;left:0;width:0;height:100vh;height:100svh;visibility:hidden;pointer-events:none'

    const measure = () => {
      vh = probe.getBoundingClientRect().height || window.innerHeight
      const stageH = Math.max(vh, peek.offsetHeight)
      travel = Math.round(vh * TRAVEL)
      start = root.getBoundingClientRect().top + window.scrollY + (stageH - vh)
      root.style.setProperty('--xf-vh', `${vh}px`)
      root.style.setProperty('--xf-stage-h', `${stageH}px`)
      root.style.setProperty('--xf-travel', `${travel}px`)
      root.style.setProperty('--xf-start', `${stageH - vh}px`)
      root.dataset.xfStart = String(Math.round(start))
      root.dataset.xfTravel = String(travel)
      lastP = -1
      frame()
    }

    const frame = () => {
      raf = 0
      const p = Math.min(1, Math.max(0, (window.scrollY - start) / (travel || 1)))
      const q = Math.round(p * 1000) / 1000
      if (q === lastP) return
      lastP = q
      root.style.setProperty('--p', String(q))
      const nowLive = q >= LIVE_AT
      if (nowLive !== live) {
        live = nowLive
        root.classList.toggle('xf-live', live)
        peek.inert = live
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame) }
    let lastW = window.innerWidth
    const onResize = () => {
      if (window.innerWidth === lastW && on) return // iOS toolbar show/hide: keep the svh numbers
      lastW = window.innerWidth
      sync()
    }
    const toEnd = (smooth: boolean) => window.scrollTo({ top: start + travel, behavior: smooth && !still.matches ? 'smooth' : 'auto' })
    const onCue = (e: MouseEvent) => { e.preventDefault(); toEnd(true) }
    // keyboard: tabbing into the login while it is still faint brings it fully in
    const onFocus = () => { if (!live) toEnd(true) }

    const enable = () => {
      on = true
      root.appendChild(probe)
      root.classList.add('xfade')
      measure()
      window.addEventListener('scroll', onScroll, { passive: true })
      cue?.addEventListener('click', onCue)
      login.addEventListener('focusin', onFocus)
      if (window.location.hash === '#login') toEnd(false)
    }
    const disable = () => {
      on = false
      window.removeEventListener('scroll', onScroll)
      cue?.removeEventListener('click', onCue)
      login.removeEventListener('focusin', onFocus)
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      root.classList.remove('xfade', 'xf-live')
      peek.inert = false
      live = false
      for (const k of ['--p', '--xf-vh', '--xf-stage-h', '--xf-travel', '--xf-start']) root.style.removeProperty(k)
      probe.remove()
    }
    const sync = () => {
      const want = narrow.matches && !still.matches
      if (want && !on) enable()
      else if (!want && on) disable()
      else if (on) measure()
    }

    sync()
    const ro = new ResizeObserver(() => { if (on) measure() })
    ro.observe(peek)
    window.addEventListener('resize', onResize)
    narrow.addEventListener('change', sync)
    still.addEventListener('change', sync)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
      narrow.removeEventListener('change', sync)
      still.removeEventListener('change', sync)
      disable()
    }
  }, [])
  // p=0 and p=1 settle points (light proximity snap); only shown in .xfade
  return (
    <>
      <span className="xf-snap xf-snap-0" aria-hidden />
      <span className="xf-snap xf-snap-1" aria-hidden />
    </>
  )
}
