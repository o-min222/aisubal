'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { PostCard } from '@/components/timeline/post-card'
import { Composer, type ComposerIdentity } from '@/components/feed/composer'
import { nestThread, NESTED_PREVIEW, replyMentionPrefill, type ReplyToRef } from '@/lib/thread'
import type { TimelinePost } from '@/components/timeline/types'
import { postApi, type FeedMode } from '@/lib/feed-mode'
import { T } from '@/i18n/t'

/** A118: Threads-style 댓글 + one indent of 대댓글, with a 답글 composer on the card. */
export function FeedCommentThread({
  rootId,
  replies,
  mode,
  me,
  canReply,
  actionsFor,
  adminHide,
}: {
  rootId: string
  replies: TimelinePost[]
  mode: FeedMode
  me?: ComposerIdentity | null
  canReply: boolean
  actionsFor?: (post: TimelinePost) => ReactNode
  adminHide?: boolean
}) {
  const groups = useMemo(() => nestThread(rootId, replies), [rootId, replies])
  const [replyTo, setReplyTo] = useState<TimelinePost | null>(null)
  const [openMore, setOpenMore] = useState<Record<string, boolean>>({})

  function composerFor(target: TimelinePost) {
    if (!me || !canReply || replyTo?.id !== target.id) return null
    const firstLevelId = target.parentId && target.parentId !== rootId ? target.parentId : target.id
    return (
      <div className="comment-inline-compose">
        <Composer
          key={target.id}
          me={me}
          parentId={target.id}
          replyKind="reply"
          autoFocus
          initialBody={replyMentionPrefill(target, rootId)}
          countIds={[rootId, firstLevelId]}
          replyToLabel={target.author.name}
          onCancelReply={() => setReplyTo(null)}
          onPosted={() => setReplyTo(null)}
        />
      </div>
    )
  }

  function card(post: TimelinePost, replyTo: ReplyToRef | null) {
    return (
      <>
        <PostCard
          post={post}
          isReply
          expandImage
          replyTo={replyTo}
          likeEndpoint={postApi(mode, post.id, 'like')}
          likersEndpoint={postApi(mode, post.id, 'likers')}
          actions={actionsFor?.(post)}
          adminHide={adminHide}
          onReply={canReply && me && !post.isDeleted ? () => setReplyTo(post) : undefined}
        />
        {composerFor(post)}
      </>
    )
  }

  return (
    <ol className="comment-list">
      {groups.map((g) => {
        const expanded = Boolean(openMore[g.post.id])
        const hidden = !expanded ? Math.max(0, g.children.length - NESTED_PREVIEW) : 0
        const shown = hidden ? g.children.slice(0, NESTED_PREVIEW) : g.children
        return (
          <li key={g.post.id} className="comment-group">
            {card(g.post, g.replyTo)}
            {g.children.length > 0 && (
              <ol className="comment-replies">
                {shown.map((c) => (
                  <li key={c.post.id} className="comment-reply">
                    {card(c.post, c.replyTo)}
                  </li>
                ))}
                {hidden > 0 && (
                  <li>
                    <button
                      type="button"
                      className="comment-more"
                      onClick={() => setOpenMore((m) => ({ ...m, [g.post.id]: true }))}
                    >
                      <T s="답글 {count}개 더 보기" vars={{ count: hidden }} />
                    </button>
                  </li>
                )}
                {expanded && g.children.length > NESTED_PREVIEW && (
                  <li>
                    <button
                      type="button"
                      className="comment-more"
                      onClick={() => setOpenMore((m) => ({ ...m, [g.post.id]: false }))}
                    >
                      <T>접기</T>
                    </button>
                  </li>
                )}
              </ol>
            )}
          </li>
        )
      })}
    </ol>
  )
}
