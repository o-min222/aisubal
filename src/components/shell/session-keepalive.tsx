'use client'

import { useEffect } from 'react'
import { nextKeepaliveDelayMs } from '@/lib/session-keep-alive'

/**
 * A109: keep the httpOnly session fresh so a PWA resume or the next navigation
 * does not wait on a middleware token refresh. Session cookies are server-only,
 * so this POSTs /api/auth/refresh rather than using the browser Supabase client.
 */
export function SessionKeepalive() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    async function tick() {
      if (cancelled || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
      try {
        const res = await fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
        if (cancelled) return
        if (res.status === 204 || res.status === 403) return
        const data = (await res.json().catch(() => ({}))) as { expiresAt?: number | null }
        timer = setTimeout(tick, nextKeepaliveDelayMs(data.expiresAt ?? null))
      } catch {
        if (!cancelled) timer = setTimeout(tick, 60_000)
      }
    }

    function onVisible() {
      if (document.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      void tick()
    }

    void tick()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [])
  return null
}
