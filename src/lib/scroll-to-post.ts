/**
 * A44: after a comment is posted the thread re-renders (router.refresh); wait for the new card
 * and bring it into view. Gives up quietly after ~4s.
 */
export function scrollToPosted(id: string | undefined | null) {
  if (!id || typeof window === 'undefined') return
  const started = Date.now()
  const tick = () => {
    const el = document.querySelector<HTMLElement>(`[data-post-id="${CSS.escape(id)}"]`)
    if (el) {
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
      el.classList.add('just-posted')
      window.setTimeout(() => el.classList.remove('just-posted'), 1600)
      return
    }
    if (Date.now() - started < 4000) window.setTimeout(tick, 120)
  }
  tick()
}
