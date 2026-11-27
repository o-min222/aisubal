import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { CommentList } from '@/components/comments/comment-list'
import { FeedCommentThread } from '@/components/comments/feed-comment-thread'
import { flatThread } from '@/lib/thread'
import { postApi, type FeedMode } from '@/lib/feed-mode'
import type { ComposerIdentity } from '@/components/feed/composer'

/**
 * One thread page for every timeline: the post, a meta line, comments, then the reply box
 * at the bottom (A44: read what's there before writing; or a note when the viewer may not reply).
 * The human feed (A118) nests 대댓글 one indent under each comment; Agora / 익명 stay flat (A75).
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
  commentReply,
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
  /** A118: feed-only. When set, comments nest and each card gets a 답글 action. */
  commentReply?: { me: ComposerIdentity; disabled?: boolean }
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
          ) : commentReply ? (
            <FeedCommentThread
              rootId={root.id}
              replies={replies}
              mode={mode}
              me={commentReply.me}
              canReply={!commentReply.disabled && !root.isDeleted}
              actionsFor={actionsFor}
              adminHide={adminHide}
            />
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
