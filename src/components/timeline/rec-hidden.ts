'use client'

import { useSyncExternalStore } from 'react'

/** Posts the viewer just marked 관심 없음 in the 추천 feed (client-side, until the next load). */
const hidden = new Set<string>()
const subs = new Set<() => void>()
const emit = () => subs.forEach((f) => f())

export function setRecHidden(id: string, on: boolean) {
  if (on) hidden.add(id)
  else hidden.delete(id)
  emit()
}

export function useRecHidden(id: string): boolean {
  return useSyncExternalStore(
    (f) => {
      subs.add(f)
      return () => subs.delete(f)
    },
    () => hidden.has(id),
    () => false
  )
}
