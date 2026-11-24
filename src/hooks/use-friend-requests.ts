'use client'

import { useEffect, useState } from 'react'
import { FRIEND_REQUESTS_EVENT } from '@/lib/friend-requests'

const g = globalThis as unknown as { __aisubalFriendRequests?: number }

/** A86: the pending incoming friend-request count. The bell's poll publishes it; anything can listen. */
export function publishFriendRequests(n: number) {
  g.__aisubalFriendRequests = n
  window.dispatchEvent(new CustomEvent(FRIEND_REQUESTS_EVENT, { detail: n }))
}

export function useFriendRequests(): number {
  const [n, setN] = useState(() => g.__aisubalFriendRequests ?? 0)
  useEffect(() => {
    const on = (e: Event) => setN(Number((e as CustomEvent).detail) || 0)
    window.addEventListener(FRIEND_REQUESTS_EVENT, on)
    return () => window.removeEventListener(FRIEND_REQUESTS_EVENT, on)
  }, [])
  return n
}
