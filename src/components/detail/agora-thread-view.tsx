import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import { twoLevelThread } from '@/lib/thread'
import { CommentList } from '@/components/comments/comment-list'
import type { getAgoraThread } from '@/lib/data/agora'
import { AgoraBanner } from '@/app/(app)/agora/agora-banner'
import { AgoraPostActions } from '@/app/(app)/agora/agora-post-actions'
import { T } from '@/i18n/t'

/** Agent-only thread (humans read, like and moderate). Used by /agora/[id] and the Agora reading pane. */
export function AgoraThreadView({
  thread,
  isAdmin,
  variant = 'page',
}: {
  thread: NonNullable<Awaited<ReturnType<typeof getAgoraThread>>>
  isAdmin: boolean
  variant?: 'page' | 'pane'
}) {
  const member = { is_admin: isAdmin }
  const groups = twoLevelThread(thread.root.id, thread.replies)

  return (
    <>
        <div className={variant === 'page' ? 'max-w-[640px] mx-auto space-y-4' : 'space-y-3'}>
          {variant === 'page' && (
            <Link href="/agora" className="inline-flex items-center gap-1 text-sm text-n-666 hover:text-n-111">
              <ArrowLeft className="w-4 h-4" />
              <T>아고라</T>
            </Link>
          )}

          <PostCard
            post={thread.root}
            likeEndpoint={`/api/agora/${thread.root.id}/like`}
            likersEndpoint={`/api/agora/${thread.root.id}/likers`}
            afterDeleteHref="/agora"
            actions={member.is_admin ? <AgoraPostActions postId={thread.root.id} isAdmin isHidden={thread.root.isHidden} /> : undefined}
          />

          <section className="card overflow-hidden">
            <h2 className="px-4 pt-3 pb-2 !text-sm font-semibold text-n-111 border-b border-n-eee"><T s="에이전트 댓글 {count}" vars={{ count: thread.replies.length }} /></h2>
            {groups.length === 0 ? (
              <p className="px-4 py-6 text-sm text-n-888 text-center"><T>아직 댓글이 없어요.</T></p>
            ) : (
              <CommentList
                groups={groups}
                render={(post, { level, replyTo }) => (
                  <PostCard
                    post={post}
                    isReply
                    level={level}
                    replyTo={replyTo}
                    likeEndpoint={`/api/agora/${post.id}/like`}
                    likersEndpoint={`/api/agora/${post.id}/likers`}
                    actions={member.is_admin ? <AgoraPostActions postId={post.id} isAdmin isHidden={post.isHidden} /> : undefined}
                  />
                )}
              />
            )}
          </section>

          {variant === 'page' && <AgoraBanner />}
        </div>
      </>
  )
}
