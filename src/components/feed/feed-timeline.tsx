'use client'

import { useRef, useState, type TouchEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { AnonActions } from '@/components/anon/anon-actions'

/**
 * Timeline list with pull-to-refresh (touch) and "더 보기" paging.
 * Defaults to the human feed; the 익명 board passes its own paths.
 */
export function FeedTimeline({
  initial,
  basePath = '/posts',
  apiBase = '/api/feed',
  query = '',
  paging = 'before',
  anonymous = false,
  emptyTitle = '아직 글이 없어요',
  emptyHint = '첫 글을 남겨보세요.',
}: {
  initial: TimelinePost[]
  basePath?: string
  apiBase?: string
  /** extra list query, e.g. "category=work&sort=popular" */
  query?: string
  paging?: 'before' | 'offset'
  anonymous?: boolean
  emptyTitle?: string
  emptyHint?: string
}) {
  const router = useRouter()
  const [extra, setExtra] = useState<TimelinePost[]>([])
  const [done, setDone] = useState(initial.length < 30)
  const [loading, setLoading] = useState(false)
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const posts = [...initial, ...extra.filter((e) => !initial.some((i) => i.id === e.id))]

  async function more() {
    const last = posts[posts.length - 1]
    if (!last || loading) return
    setLoading(true)
    try {
      const cursor = paging === 'offset' ? `offset=${posts.length}` : `before=${encodeURIComponent(last.createdAt)}`
      const res = await fetch(`${apiBase}?${query ? `${query}&` : ''}${cursor}`)
      const data = await res.json()
      const next: TimelinePost[] = data.posts || []
      setExtra((x) => [...x, ...next])
      if (next.length < 30) setDone(true)
    } finally {
      setLoading(false)
    }
  }

  function onTouchStart(e: TouchEvent) {
    startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
  }
  function onTouchMove(e: TouchEvent) {
    if (startY.current === null) return
    const d = e.touches[0].clientY - startY.current
    setPull(d > 0 ? Math.min(d * 0.5, 80) : 0)
  }
  function onTouchEnd() {
    if (pull > 56) {
      setRefreshing(true)
      router.refresh()
      setTimeout(() => setRefreshing(false), 900)
    }
    setPull(0)
    startY.current = null
  }

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div
        className="ptr"
        style={{ height: refreshing ? 44 : pull, opacity: refreshing ? 1 : pull / 60 }}
        aria-hidden={!refreshing}
      >
        <Loader2 className={`w-5 h-5 text-[#888] ${refreshing || pull > 56 ? 'animate-spin' : ''}`} />
      </div>
      {posts.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium text-[#333]">{emptyTitle}</p>
          <p className="text-sm text-[#888] mt-1">{emptyHint}</p>
        </div>
      ) : (
        <div className="timeline-list">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              href={`${basePath}/${p.id}`}
              replyHref={`${basePath}/${p.id}`}
              likeEndpoint={`${apiBase}/${p.id}/like`}
              likersEndpoint={`${apiBase}/${p.id}/likers`}
              actions={anonymous ? <AnonActions post={p} /> : undefined}
            />
          ))}
        </div>
      )}
      {!done && posts.length > 0 && (
        <button type="button" onClick={more} disabled={loading} className="btn btn-secondary w-full mt-3 min-h-[44px]">
          {loading ? '불러오는 중…' : '더 보기'}
        </button>
      )}
    </div>
  )
}
