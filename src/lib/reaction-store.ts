'use client'

import { useEffect, useSyncExternalStore } from 'react'
import type { CustomEmoji, ReactionSummary } from '@/lib/emoji-rules'

/**
 * A39: client cache of emoji-reaction summaries (non-👍) per post, loaded in one batched
 * request for the cards on screen, plus the custom-emoji list (loaded once on demand).
 */
const EMPTY: ReactionSummary[] = []
const g = globalThis as unknown as {
  __rx?: { cache: Map<string, ReactionSummary[]>; subs: Map<string, Set<() => void>>; pending: Set<string>; inflight: Set<string>; timer: ReturnType<typeof setTimeout> | null }
  __rxCustom?: { list: CustomEmoji[] | null; isAdmin: boolean; loading: Promise<void> | null; subs: Set<() => void> }
}
const st = () => (g.__rx ??= { cache: new Map(), subs: new Map(), pending: new Set(), inflight: new Set(), timer: null })
const cst = () => (g.__rxCustom ??= { list: null, isAdmin: false, loading: null, subs: new Set() })

function notify(id: string) {
  st().subs.get(id)?.forEach((f: () => void) => f())
}

export function setReactions(id: string, list: ReactionSummary[]) {
  st().cache.set(id, list)
  notify(id)
}

export function getReactions(id: string): ReactionSummary[] {
  return st().cache.get(id) ?? EMPTY
}

/** A60: 아고라 posts live in their own table — their cache keys are `agora:<id>` */
export const reactionKey = (id: string, surface: 'feed' | 'agora' = 'feed') => (surface === 'agora' ? `agora:${id}` : id)

async function flush() {
  const s = st()
  s.timer = null
  const keys = [...s.pending]
  s.pending.clear()
  for (const surface of ['feed', 'agora'] as const) {
    const pre = surface === 'agora' ? 'agora:' : ''
    const ids = keys.filter((k) => (pre ? k.startsWith(pre) : !k.startsWith('agora:'))).map((k) => k.slice(pre.length))
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      chunk.forEach((id) => s.inflight.add(pre + id))
      try {
        const res = await fetch(`/api/${surface}/reactions?ids=${chunk.map(encodeURIComponent).join(',')}`)
        const data = (await res.json().catch(() => ({}))) as { reactions?: Record<string, ReactionSummary[]> }
        for (const id of chunk) if (data.reactions?.[id]) setReactions(pre + id, data.reactions[id])
      } catch {
        /* chips just stay empty */
      } finally {
        chunk.forEach((id) => s.inflight.delete(pre + id))
      }
    }
  }
}

function ensure(id: string) {
  const s = st()
  if (s.cache.has(id) || s.inflight.has(id) || s.pending.has(id)) return
  s.pending.add(id)
  s.timer ??= setTimeout(flush, 30)
}

/** known = the server row already says there are none (reaction_count 0): skip the request */
export function useReactions(id: string, knownEmpty: boolean): ReactionSummary[] {
  const list = useSyncExternalStore(
    (cb) => {
      const s = st()
      if (!s.subs.has(id)) s.subs.set(id, new Set())
      s.subs.get(id)!.add(cb)
      return () => s.subs.get(id)?.delete(cb)
    },
    () => getReactions(id),
    () => EMPTY
  )
  useEffect(() => {
    if (!knownEmpty) ensure(id)
  }, [id, knownEmpty])
  return list
}

// ---------------------------------------------------------------- custom emoji

export function loadCustomEmoji(force = false): Promise<void> {
  const c = cst()
  if (c.list && !force) return Promise.resolve()
  if (c.loading && !force) return c.loading
  c.loading = fetch('/api/emoji')
    .then((r) => r.json())
    .then((d: { emojis?: CustomEmoji[]; isAdmin?: boolean }) => {
      c.list = d.emojis ?? []
      c.isAdmin = Boolean(d.isAdmin)
      c.subs.forEach((f) => f())
    })
    .catch(() => {})
    .finally(() => {
      c.loading = null
    })
  return c.loading
}

export function setCustomEmoji(list: CustomEmoji[]) {
  const c = cst()
  c.list = list
  c.subs.forEach((f) => f())
}

const NONE: CustomEmoji[] = []
export function useCustomEmoji(load: boolean): { list: CustomEmoji[]; isAdmin: boolean } {
  const list = useSyncExternalStore(
    (cb) => {
      cst().subs.add(cb)
      return () => cst().subs.delete(cb)
    },
    () => cst().list ?? NONE,
    () => NONE
  )
  useEffect(() => {
    if (load) void loadCustomEmoji()
  }, [load])
  return { list, isAdmin: cst().isAdmin }
}
