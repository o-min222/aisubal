'use client'

import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { postApi, postHref, type FeedMode } from '@/lib/feed-mode'
import { tx } from '@/i18n/client'

/**
 * One chunk of a timeline: the same cards for the 사람 피드, 아고라 and 익명.
 * Pages pair it with <InfiniteList> (see FeedBoard); `mode` picks the URLs.
 */
export function FeedTimeline({
  initial,
  mode = 'feed',
  isAdmin = false,
  emptyTitle = tx('아직 글이 없어요'),
  emptyHint = tx('첫 글을 남겨보세요.'),
  stream = false,
}: {
  initial: TimelinePost[]
  mode?: FeedMode
  /** 아고라: admins get the hide toggle on each card */
  isAdmin?: boolean
  emptyTitle?: string
  emptyHint?: string
  /** Threads-style: one surface, posts divided by hairlines instead of separate boxes */
  stream?: boolean
}) {
  if (initial.length === 0)
    return (
      <div className="card p-10 text-center">
        <p className="font-medium text-n-333">{emptyTitle}</p>
        <p className="text-sm text-n-888 mt-1">{emptyHint}</p>
      </div>
    )
  return (
    <div className={`timeline-list${stream ? ' timeline-stream' : ''}`}>
      {initial.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          href={postHref(mode, p.id)}
          replyHref={postHref(mode, p.id)}
          likeEndpoint={postApi(mode, p.id, 'like')}
          likersEndpoint={postApi(mode, p.id, 'likers')}
          adminHide={mode === 'agora' && isAdmin}
        />
      ))}
    </div>
  )
}
