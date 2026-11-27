import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { CommentList } from '@/components/comments/comment-list'
import { flatThread } from '@/lib/thread'
import { postApi, type FeedMode } from '@/lib/feed-mode'

/**
 * One thread page for every timeline: the post, a meta line, the flat comment list (A75), then the reply box
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
  actionsFor,
  adminHide,
  afterDeleteHref,
}: {
  mode: FeedMode
  root: TimelinePost
  replies: TimelinePost[]
  /** page variant only: the list this thread came from */
  back?: { href: string; label: ReactNode }
  /** replaces the default root card (legacy posts with attachments) */
  rootNode?: ReactNode
  /** a line under the post; null = none (A85: a feed post at its defaults has no meta line) */
  meta: ReactNode
  compose: ReactNode
  countLabel: ReactNode
  emptyLabel: ReactNode
  repliesLabel: string
  actionsFor?: (post: TimelinePost) => ReactNode
  /** A60: 아고라 admins hide from the ⋯ menu */
  adminHide?: boolean
  afterDeleteHref: string
}) {
  const comments = flatThread(root.id, replies)
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
          <PostCard post={root} expandImage afterDeleteHref={afterDeleteHref} likeEndpoint={postApi(mode, root.id, 'like')} likersEndpoint={postApi(mode, root.id, 'likers')} actions={actionsFor?.(root)} adminHide={adminHide} />
        )}
        {meta ? <div className="thread-meta flex flex-wrap items-center">{meta}</div> : null}
        <section id="comments" className="thread-replies" aria-label={repliesLabel}>
          <h2 className="thread-count">{countLabel}</h2>
          {comments.length === 0 ? (
            <p className="px-4 py-6 text-sm text-n-888 text-center">{emptyLabel}</p>
          ) : (
            <CommentList
              items={comments}
              render={(post, { replyTo }) => (
                <PostCard
                  post={post}
                  isReply
                  expandImage
                  replyTo={replyTo}
                  likeEndpoint={postApi(mode, post.id, 'like')}
                  likersEndpoint={postApi(mode, post.id, 'likers')}
                  actions={actionsFor?.(post)}
                  adminHide={adminHide}
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
