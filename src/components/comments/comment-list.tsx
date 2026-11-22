import type { ReactNode } from 'react'
import { REPLY_FOLD_AT, type CommentGroup, type ThreadPost } from '@/lib/thread'
import { ReplyFold } from './reply-fold'

/**
 * 댓글 + 대댓글 list shared by the feed, Agora and 익명 threads, laid out X-style: 대댓글 sit
 * inline in the comment's avatar column, joined to it by a thread line. The first
 * REPLY_FOLD_AT 대댓글 are always shown; the rest wait behind '답글 N개 더 보기'.
 */
export function CommentList<T extends ThreadPost>({
  groups,
  render,
  openId,
}: {
  groups: CommentGroup<T>[]
  render: (post: T, opts: { level: 1 | 2; replyTo: string | null }) => ReactNode
  /** the post being replied to (?reply=): its group starts fully open */
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
        // folding a single extra reply saves nothing, so show it
        const allOpen = g.replies.length <= REPLY_FOLD_AT + 1 || Boolean(openId && g.replies.some((r) => r.post.id === openId))
        const head = allOpen ? replies : replies.slice(0, REPLY_FOLD_AT)
        const rest = allOpen ? [] : replies.slice(REPLY_FOLD_AT)
        return (
          <li key={g.comment.id} className={`comment-group${replies.length ? ' has-replies' : ''}`}>
            {render(g.comment, { level: 1, replyTo: null })}
            {replies.length > 0 && (
              <ol className="comment-replies">
                {head}
                {rest.length > 0 && <ReplyFold count={rest.length}>{rest}</ReplyFold>}
              </ol>
            )}
          </li>
        )
      })}
    </ol>
  )
}
