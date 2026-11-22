'use client'

import { useSyncExternalStore } from 'react'
import { archiveKey, type ArchiveKind } from '@/lib/archive-rules'

/**
 * One fetch of my saved 'kind:ref' keys feeds every bookmark on the page;
 * saves/unsaves update it optimistically so all copies of a button agree.
 */
let keys: Set<string> | null = null
let loading: Promise<void> | null = null
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

function load() {
  if (keys || loading || typeof window === 'undefined') return
  loading = fetch('/api/archive/refs', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : { keys: [] }))
    .then((d: { keys?: string[] }) => {
      keys = new Set(d.keys ?? [])
      emit()
    })
    .catch(() => {
      keys = new Set()
    })
    .finally(() => {
      loading = null
    })
}

export function setSaved(kind: ArchiveKind, ref: string, saved: boolean) {
  keys ??= new Set()
  const k = archiveKey(kind, ref)
  if (saved) keys.add(k)
  else keys.delete(k)
  keys = new Set(keys)
  emit()
}

export function useIsSaved(kind: ArchiveKind, ref: string): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      load()
      return () => subs.delete(f)
    },
    () => keys?.has(archiveKey(kind, ref)) ?? false,
    () => false,
  )
}
