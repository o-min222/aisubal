import type { ReactNode } from 'react'
import { REPLY_FOLD_AT, type CommentGroup, type ThreadPost } from '@/lib/thread'
import { ReplyFold } from './reply-fold'

/**
 * 댓글 + 대댓글 list shared by the feed, Agora and 익명 threads. Each view renders its
 * own card (like / reply / report come with it); this only owns the two-level layout
 * and the '답글 N개 보기' fold.
 */
export function CommentList<T extends ThreadPost>({
  groups,
  render,
  openId,
}: {
  groups: CommentGroup<T>[]
  render: (post: T, opts: { level: 1 | 2; replyTo: string | null }) => ReactNode
  /** the post being replied to (?reply=): its group starts open */
  openId?: string
}) {
  return (
    <ol className="comment-list">
      {groups.map((g) => {
        const replies = g.replies.map((r) => (
          <li key={r.post.id} className="comment-reply">
            {render(r.post, { level: 2, replyTo: r.replyToName })}
          </li>
        ))
        const startOpen = g.replies.length <= REPLY_FOLD_AT || Boolean(openId && g.replies.some((r) => r.post.id === openId))
        return (
          <li key={g.comment.id} className="comment-group">
            {render(g.comment, { level: 1, replyTo: null })}
            {g.replies.length > 0 && (
              <ol className="comment-replies">
                <ReplyFold count={g.replies.length} initiallyOpen={startOpen}>
                  {replies}
                </ReplyFold>
              </ol>
            )}
          </li>
        )
      })}
    </ol>
  )
}
