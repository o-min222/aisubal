'use client'

import { useEffect, useState } from 'react'

/**
 * A95: the viewer's repost of a post, kept in step across every card that shows it (feed, profile,
 * post page) right after a tap, the way count-store does for likes. An entry is dropped after TTL_MS
 * or when fresh server props disagree with the value they were built from.
 */
type Entry = { count: number; mine: boolean; at: number }
export type RepostState = { count: number; mine: boolean }

const TTL_MS = 60_000
const EVENT = 'aisubal:reposts'
const g = globalThis as unknown as { __aisubalRepostStore?: Map<string, Entry> }
const store = () => (g.__aisubalRepostStore ??= new Map())

function live(id: string): Entry | undefined {
  const e = store().get(id)
  if (e && Date.now() - e.at > TTL_MS) {
    store().delete(id)
    return undefined
  }
  return e
}

export function publishRepost(id: string, count: number, mine: boolean) {
  store().set(id, { count: Math.max(0, count), mine, at: Date.now() })
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
}

export function useRepost(id: string, server: RepostState): RepostState {
  const [, bump] = useState(0)
  useEffect(() => {
    const h = (e: Event) => (e as CustomEvent<string>).detail === id && bump((n) => n + 1)
    window.addEventListener(EVENT, h)
    return () => window.removeEventListener(EVENT, h)
  }, [id])
  const e = live(id)
  return e ? { count: e.count, mine: e.mine } : server
}
