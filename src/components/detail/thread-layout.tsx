import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { CommentList } from '@/components/comments/comment-list'
import { twoLevelThread } from '@/lib/thread'
import { postApi, type FeedMode } from '@/lib/feed-mode'

/**
 * One thread page for every timeline: the post, a meta line, 댓글 + 대댓글, then the reply box
 * at the bottom (A44: read what's there before writing; or a note when the viewer may not reply).
 */
export function ThreadLayout({
  mode,
  root,
  replies,
  back,
  rootNode,
  meta,
  compose,
  countLabel,
  emptyLabel,
  repliesLabel,
  openId,
  replyHref,
  actionsFor,
  afterDeleteHref,
}: {
  mode: FeedMode
  root: TimelinePost
  replies: TimelinePost[]
  /** page variant only: the list this thread came from */
  back?: { href: string; label: ReactNode }
  /** replaces the default root card (legacy posts with attachments) */
  rootNode?: ReactNode
  meta: ReactNode
  compose: ReactNode
  countLabel: ReactNode
  emptyLabel: ReactNode
  repliesLabel: string
  /** ?reply= target: its comment group starts unfolded */
  openId?: string
  replyHref?: (post: TimelinePost) => string | undefined
  actionsFor?: (post: TimelinePost) => ReactNode
  afterDeleteHref: string
}) {
  const groups = twoLevelThread(root.id, replies)
  return (
    <div className={back ? 'space-y-3 thread-page' : 'space-y-3'}>
      {back && (
        <Link href={back.href} className="hidden md:inline-flex items-center gap-1 text-sm text-n-666 hover:text-n-111 min-h-[36px]">
          <ArrowLeft className="w-4 h-4" />
          {back.label}
        </Link>
      )}
      <article className="thread-surface">
        {rootNode ?? (
          <PostCard post={root} afterDeleteHref={afterDeleteHref} likeEndpoint={postApi(mode, root.id, 'like')} likersEndpoint={postApi(mode, root.id, 'likers')} actions={actionsFor?.(root)} />
        )}
        <div className="thread-meta flex flex-wrap items-center">{meta}</div>
        <section id="comments" className="thread-replies" aria-label={repliesLabel}>
          <h2 className="thread-count">{countLabel}</h2>
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-sm text-n-888 text-center">{emptyLabel}</p>
          ) : (
            <CommentList
              groups={groups}
              openId={openId}
              render={(post, { level, replyTo }) => (
                <PostCard
                  post={post}
                  isReply
                  level={level}
                  replyTo={replyTo}
                  replyHref={replyHref?.(post)}
                  likeEndpoint={postApi(mode, post.id, 'like')}
                  likersEndpoint={postApi(mode, post.id, 'likers')}
                  actions={actionsFor?.(post)}
                />
              )}
            />
          )}
          <div className="thread-compose">{compose}</div>
        </section>
      </article>
    </div>
  )
}
