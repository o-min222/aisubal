import type { TimelinePost } from '@/components/timeline/types'
import { InfiniteList, type LoadChunk } from '@/components/infinite/infinite-list'
import { EmptyList } from '@/components/reading/compact-row'
import { FeedTimeline } from './feed-timeline'
import type { FeedMode } from '@/lib/feed-mode'

/**
 * The list half of the 사람 피드 / 아고라 / 익명 pages: first page server-rendered,
 * the rest streamed by `load` (an inline server action returning <FeedTimeline>).
 */
export function FeedBoard({
  mode,
  label,
  posts,
  hasMore,
  load,
  storageKey,
  empty,
  isAdmin,
}: {
  mode: FeedMode
  label: string
  posts: TimelinePost[]
  hasMore: boolean
  load: LoadChunk
  /** the list's URL: back-navigation restore key, and a new list when it changes */
  storageKey: string
  empty: { title: string; hint?: string }
  isAdmin?: boolean
}) {
  if (posts.length === 0) return <EmptyList title={empty.title} hint={empty.hint} />
  return (
    <section aria-label={label}>
      <InfiniteList key={storageKey} className="inf-surface inf-stream" hasMore={hasMore} load={load} storageKey={storageKey}>
        <FeedTimeline mode={mode} initial={posts} isAdmin={isAdmin} stream />
      </InfiniteList>
    </section>
  )
}
