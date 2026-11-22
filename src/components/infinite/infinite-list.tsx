'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { REFRESH_EVENT } from '@/components/shell/pull-to-refresh'
import { T } from '@/i18n/t'

/** One more page of an infinite list, rendered on the server (rows keep their own client parts). */
export type Chunk = { nodes: ReactNode; hasMore: boolean }
export type LoadChunk = (page: number) => Promise<Chunk>

type Saved = { n: number; y: number }
const SAVE_PREFIX = 'aisubal:inf:'

// Back/forward navigation flag: set by popstate, consumed by the list that mounts next.
let popped = false
if (typeof window !== 'undefined') window.addEventListener('popstate', () => (popped = true))

function readSaved(key: string): Saved | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(SAVE_PREFIX + key) || 'null') as Saved | null
    return v && Number.isFinite(v.n) && Number.isFinite(v.y) ? v : null
  } catch {
    return null
  }
}

/**
 * Infinite scroll for every list (A12): page 1 is server-rendered as `children`; reaching the
 * end loads the next page through `load` (cursor = page number), with skeleton rows, an end
 * marker, scroll position restored on back navigation, and a reset on pull-to-refresh.
 * Without `children` the first page is loaded on mount (popovers).
 */
export function InfiniteList({
  children,
  hasMore: initialMore = true,
  load,
  storageKey,
  skeleton = 3,
  endLabel,
  className = '',
}: {
  children?: ReactNode
  hasMore?: boolean
  load: LoadChunk
  /** where to remember loaded pages + scroll for back navigation; omit to not restore (popovers) */
  storageKey?: string
  skeleton?: number
  endLabel?: ReactNode
  className?: string
}) {
  const first = children === undefined ? 1 : 2
  const [chunks, setChunks] = useState<ReactNode[]>([])
  const [more, setMore] = useState(initialMore)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const sentinel = useRef<HTMLDivElement>(null)
  const loading = useRef(false)
  const pageRef = useRef(first)
  const loadRef = useRef(load)
  useLayoutEffect(() => {
    loadRef.current = load
  }, [load])

  const next = useCallback(async () => {
    if (loading.current) return false
    loading.current = true
    setBusy(true)
    setFailed(false)
    try {
      const c = await loadRef.current(pageRef.current)
      pageRef.current += 1
      setChunks((xs) => [...xs, c.nodes])
      setMore(c.hasMore)
      return c.hasMore
    } catch {
      setFailed(true)
      return false
    } finally {
      loading.current = false
      setBusy(false)
    }
  }, [])

  // back navigation: replay the pages that were loaded, then jump to where the reader was
  useEffect(() => {
    if (!storageKey) return
    const saved = popped ? readSaved(storageKey) : null
    popped = false
    if (!saved) return
    let alive = true
    ;(async () => {
      for (let i = 0; i < saved.n && alive; i++) if (!(await next())) break
      if (alive) requestAnimationFrame(() => window.scrollTo(0, saved.y))
    })()
    return () => {
      alive = false
    }
  }, [storageKey, next])

  // remember how far we got (pages + last scroll position) for the back button
  const lastY = useRef(0)
  useEffect(() => {
    if (!storageKey) return
    const save = () => {
      try {
        sessionStorage.setItem(SAVE_PREFIX + storageKey, JSON.stringify({ n: pageRef.current - first, y: lastY.current }))
      } catch {}
    }
    let t: ReturnType<typeof setTimeout> | null = null
    const onScroll = () => {
      lastY.current = window.scrollY
      if (!t) t = setTimeout(() => ((t = null), save()), 150)
    }
    save()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (t) clearTimeout(t)
    }
  }, [storageKey, first, chunks.length])

  // pull-to-refresh re-renders page 1 on the server: drop the appended pages
  useEffect(() => {
    const reset = () => {
      pageRef.current = first
      setChunks([])
      setMore(initialMore)
      setFailed(false)
      if (storageKey) sessionStorage.removeItem(SAVE_PREFIX + storageKey)
    }
    window.addEventListener(REFRESH_EVENT, reset)
    return () => window.removeEventListener(REFRESH_EVENT, reset)
  }, [first, initialMore, storageKey])

  // load the next page when the end comes near
  useEffect(() => {
    const el = sentinel.current
    if (!el || !more || failed) return
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && void next(), { rootMargin: '600px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, failed, next, chunks.length])

  const empty = children === undefined && chunks.length === 0
  return (
    <div className={`inf-list ${className}`}>
      {children}
      {chunks.map((c, i) => (
        <div key={i} className="inf-chunk">
          {c}
        </div>
      ))}
      {more && !failed && (
        <div ref={sentinel} className="inf-skeletons" aria-hidden={!busy}>
          {busy || empty ? (
            Array.from({ length: skeleton }, (_, i) => (
              <div key={i} className="inf-skel">
                <span className="inf-skel-dot skeleton" />
                <span className="inf-skel-lines">
                  <span className="skeleton" />
                  <span className="skeleton" />
                </span>
              </div>
            ))
          ) : (
            <span className="sr-only"><T>더 불러오는 중</T></span>
          )}
        </div>
      )}
      {busy && <span className="sr-only" role="status"><Loader2 className="w-4 h-4" /> <T>더 불러오는 중</T></span>}
      {failed && (
        <p className="inf-end">
          <T>더 불러오지 못했어요.</T>{' '}
          <button type="button" className="inf-retry" onClick={() => void next()}>
            <T>다시 시도</T>
          </button>
        </p>
      )}
      {!more && !failed && (first === 2 || chunks.length > 0) && endLabel !== null && <p className="inf-end">{endLabel ?? <T>모두 봤어요</T>}</p>}
    </div>
  )
}
