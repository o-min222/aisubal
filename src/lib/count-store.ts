'use client'

import { useEffect, useState } from 'react'

/**
 * Cross-view counter sync (N-3). A like or comment made in the reading pane / detail
 * page updates every row and card for that post right away, including list pages the
 * router cache serves on back-navigation — no '댓글 0' / stale heart until refresh.
 *
 * likes: absolute values from the API response. replies: deltas over the server value.
 * An override is dropped once fresh server props arrive (they include the change) or
 * after TTL_MS, whichever comes first.
 */
// fresh: published under FRESH_MS ago, so a server snapshot arriving now may predate it
type Entry = { likeCount?: number; liked?: boolean; replyDelta?: number; at: number; fresh?: boolean }
export type Counts = { likeCount: number; liked: boolean; replyCount: number }

const TTL_MS = 60_000
const FRESH_MS = 1500
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

function put(id: string, entry: Entry) {
  store().set(id, entry)
  setTimeout(() => {
    const cur = store().get(id)
    if (cur?.at === entry.at) store().set(id, { ...cur, fresh: false })
  }, FRESH_MS)
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }))
}

export function publishLike(id: string, likeCount: number, liked: boolean) {
  const e = live(id)
  put(id, { ...e, likeCount, liked, at: Date.now(), fresh: true })
}

export function publishReplyDelta(ids: (string | null | undefined)[], delta: number) {
  for (const id of new Set(ids.filter(Boolean) as string[])) {
    const e = live(id)
    put(id, { ...e, replyDelta: (e?.replyDelta ?? 0) + delta, at: Date.now(), fresh: true })
  }
}

/** `/api/{feed|agora|anon}/{id}/like` → id */
export const idFromLikeEndpoint = (endpoint: string) => endpoint.match(/^\/api\/[a-z]+\/([^/]+)\/like$/)?.[1] ?? null

export function useCounts(id: string | null, server: Counts): Counts {
  const [, bump] = useState(0)
  const [seen, setSeen] = useState(server)
  useEffect(() => {
    if (!id) return
    const h = (e: Event) => (e as CustomEvent<string>).detail === id && bump((n) => n + 1)
    window.addEventListener(EVENT, h)
    return () => window.removeEventListener(EVENT, h)
  }, [id])
  // new server snapshot (router.refresh / navigation) already includes our change
  if (id && (seen.likeCount !== server.likeCount || seen.replyCount !== server.replyCount || seen.liked !== server.liked)) {
    setSeen(server)
    const e = store().get(id)
    if (e && !e.fresh) store().delete(id)
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
