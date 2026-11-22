import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { getAnonThread } from '@/lib/data/anon'
import { twoLevelThread } from '@/lib/thread'
import { CommentList } from '@/components/comments/comment-list'
import { PostCard } from '@/components/timeline/post-card'
import { AnonComposer } from '@/components/anon/anon-composer'
import { AnonActions } from '@/components/anon/anon-actions'
import { T } from '@/i18n/t'

/** 익명 thread. Used by /anon/[id] and the 익명 board reading pane. */
export function AnonThreadView({
  thread,
  reply,
  variant = 'page',
  closeHref = '/anon',
}: {
  thread: NonNullable<Awaited<ReturnType<typeof getAnonThread>>>
  reply?: string
  variant?: 'page' | 'pane'
  closeHref?: string
}) {
  const groups = twoLevelThread(thread.root.id, thread.replies)
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply && !r.isDeleted && !r.isHidden) : undefined
  const rootGone = Boolean(thread.root.isDeleted)

  return (
    <div className="space-y-3">
      {variant === 'page' && (
        <Link href="/anon" className="inline-flex items-center gap-1 text-sm text-n-666 hover:text-n-111 min-h-[40px] px-1">
          <ArrowLeft className="w-4 h-4" />
          <T>익명 라운지</T>
        </Link>
      )}

      <PostCard
        post={thread.root}
        likeEndpoint={`/api/anon/${thread.root.id}/like`}
        likersEndpoint={`/api/anon/${thread.root.id}/likers`}
        actions={<AnonActions post={thread.root} afterDelete={closeHref} />}
      />

      <section className="card overflow-hidden">
        {!rootGone && (
          <div className="px-4 pt-3 pb-3 border-b border-n-eee">
            {replyTarget && (
              <div className="text-xs text-n-666 mb-2 flex items-center gap-2">
                <span>
                  <T s="{name}에게 답글" vars={{ name: <b>{replyTarget.author.name}</b> }} />
                </span>
                <Link href={`/anon/${thread.root.id}`} className="text-c-06c min-h-[32px] inline-flex items-center">
                  <T>취소</T>
                </Link>
              </div>
            )}
            <AnonComposer
              key={replyTarget?.id || 'root'}
              parentId={replyTarget?.id || thread.root.id}
              replyKind={replyTarget ? 'reply' : 'comment'}
              autoFocus={Boolean(replyTarget)}
              className="!p-0 !border-0 !shadow-none"
            />
          </div>
        )}
        <div className="px-4 pt-3 pb-2 text-sm font-semibold text-n-111 border-b border-n-eee"><T s="댓글 {count}" vars={{ count: thread.replies.filter((r) => !r.isDeleted).length }} /></div>
        {groups.length === 0 ? (
          <p className="px-4 py-6 text-sm text-n-888 text-center"><T>첫 댓글을 남겨보세요.</T></p>
        ) : (
          <CommentList
            groups={groups}
            openId={reply}
            render={(post, { level, replyTo }) => (
              <PostCard
                post={post}
                isReply
                level={level}
                replyTo={replyTo}
                replyHref={post.isDeleted || post.isHidden || rootGone ? undefined : `/anon/${thread.root.id}?reply=${post.id}`}
                likeEndpoint={`/api/anon/${post.id}/like`}
                likersEndpoint={`/api/anon/${post.id}/likers`}
                actions={post.isHidden ? undefined : <AnonActions post={post} />}
              />
            )}
          />
        )}
      </section>
    </div>
  )
}
