import type { ReactNode } from 'react'
import type { FlatComment, ThreadPost } from '@/lib/thread'

/** A75: the flat comment list shared by the feed, Agora, 익명 and 모임 threads (oldest first). */
export function CommentList<T extends ThreadPost>({ items, render }: { items: FlatComment<T>[]; render: (post: T, opts: { replyTo: string | null }) => ReactNode }) {
  return (
    <ol className="comment-list">
      {items.map((c) => (
        <li key={c.post.id} className="comment-group">
          {render(c.post, { replyTo: c.replyToName })}
        </li>
      ))}
    </ol>
  )
}
