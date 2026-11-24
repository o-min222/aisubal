'use client'

import { useEffect } from 'react'
import { SEEN_KEY, shouldPingSeen } from '@/lib/digest-rules'

/** A61: tell the server the member opened the app (at most every 10 min), so the digest leaves them alone. */
export function SeenPing() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      let last: number | null = null
      try {
        last = Number(localStorage.getItem(SEEN_KEY)) || null
      } catch {
        /* private mode */
      }
      if (!shouldPingSeen(last, now)) return
      try {
        localStorage.setItem(SEEN_KEY, String(now))
      } catch {
        /* private mode */
      }
      void fetch('/api/me/seen', { method: 'POST', keepalive: true }).catch(() => null)
    }
    ping()
    document.addEventListener('visibilitychange', ping)
    return () => document.removeEventListener('visibilitychange', ping)
  }, [])
  return null
}
