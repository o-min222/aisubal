'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Cross-view counter sync (N-3). A like or comment made in the reading pane / detail
 * page updates every row and card for that post right away, including list pages the
 * router cache serves on back-navigation — no '댓글 0' / stale heart until refresh.
 *
 * likes: absolute values from the API response. replies: deltas over the server value.
 * An override is dropped once fresh server props arrive (they include the change) or
 * after TTL_MS, whichever comes first.
 */
type Entry = { likeCount?: number; liked?: boolean; replyDelta?: number; at: number }
export type Counts = { likeCount: number; liked: boolean; replyCount: number }

const TTL_MS = 60_000
const EVENT = 'aisubal:counts'
const g = globalThis as unknown as { __aisubalCounts?: Map<string, Entry> }
const store = () => (g.__aisubalCounts ??= new Map())

function live(id: string): Entry | undefined {
  const e = store().get(id)
  if (e && Date.now() - e.at > TTL_MS) {
    store().delete(id)
    return undefined
  }
  return e
}

export function publishLike(id: string, likeCount: number, liked: boolean) {
  const e = live(id)
  store().set(id, { ...e, likeCount, liked, at: Date.now() })
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
}

export function publishReplyDelta(ids: (string | null | undefined)[], delta: number) {
  for (const id of new Set(ids.filter(Boolean) as string[])) {
    const e = live(id)
    store().set(id, { ...e, replyDelta: (e?.replyDelta ?? 0) + delta, at: Date.now() })
    window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
  }
}

/** `/api/{feed|agora|anon}/{id}/like` → id */
export const idFromLikeEndpoint = (endpoint: string) => endpoint.match(/^\/api\/[a-z]+\/([^/]+)\/like$/)?.[1] ?? null

export function useCounts(id: string | null, server: Counts): Counts {
  const [, bump] = useState(0)
  const seen = useRef(server)
  useEffect(() => {
    if (!id) return
    const h = (e: Event) => (e as CustomEvent<string>).detail === id && bump((n) => n + 1)
    window.addEventListener(EVENT, h)
    return () => window.removeEventListener(EVENT, h)
  }, [id])
  // new server snapshot (router.refresh / navigation) already includes our change
  if (id && (seen.current.likeCount !== server.likeCount || seen.current.replyCount !== server.replyCount || seen.current.liked !== server.liked)) {
    seen.current = server
    const e = store().get(id)
    if (e && Date.now() - e.at > 1500) store().delete(id)
    else if (e) store().set(id, { ...e, replyDelta: 0 })
  }
  const e = id ? live(id) : undefined
  if (!e) return server
  return {
    likeCount: e.likeCount ?? server.likeCount,
    liked: e.liked ?? server.liked,
    replyCount: Math.max(0, server.replyCount + (e.replyDelta ?? 0)),
  }
}
