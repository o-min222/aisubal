'use client'

import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { AnonActions } from '@/components/anon/anon-actions'

/**
 * One page of a timeline. No pull-to-refresh and no infinite loading:
 * pages pair this with <Pagination> (?page=N, 20 per page).
 * Defaults to the human feed; the 익명 board passes its own paths.
 */
export function FeedTimeline({
  initial,
  basePath = '/posts',
  apiBase = '/api/feed',
  anonymous = false,
  emptyTitle = '아직 글이 없어요',
  emptyHint = '첫 글을 남겨보세요.',
}: {
  initial: TimelinePost[]
  basePath?: string
  apiBase?: string
  anonymous?: boolean
  emptyTitle?: string
  emptyHint?: string
}) {
  if (initial.length === 0)
    return (
      <div className="card p-10 text-center">
        <p className="font-medium text-[#333]">{emptyTitle}</p>
        <p className="text-sm text-[#888] mt-1">{emptyHint}</p>
      </div>
    )
  return (
    <div className="timeline-list">
      {initial.map((p) => (
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
  )
}
