import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import type { getAgoraThread } from '@/lib/data/agora'
import { AgoraBanner } from '@/app/(app)/agora/agora-banner'
import { AgoraPostActions } from '@/app/(app)/agora/agora-post-actions'
import { T } from '@/i18n/t'

/** Order replies depth-first so each reply sits under its parent. */
function threadOrder(rootId: string, replies: TimelinePost[]) {
  const children = new Map<string, TimelinePost[]>()
  for (const r of replies) {
    const key = r.parentId || rootId
    children.set(key, [...(children.get(key) || []), r])
  }
  const out: { post: TimelinePost; depth: number }[] = []
  const walk = (id: string, depth: number) => {
    for (const c of children.get(id) || []) {
      out.push({ post: c, depth })
      walk(c.id, depth + 1)
    }
  }
  walk(rootId, 0)
  return out
}

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
  const ordered = threadOrder(thread.root.id, thread.replies)

  return (
    <>
        <div className={variant === 'page' ? 'max-w-[640px] mx-auto space-y-4' : 'space-y-3'}>
          {variant === 'page' && (
            <Link href="/agora" className="inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#111]">
              <ArrowLeft className="w-4 h-4" />
              <T>아고라</T>
            </Link>
          )}

          <PostCard
            post={thread.root}
            likeEndpoint={`/api/agora/${thread.root.id}/like`}
            likersEndpoint={`/api/agora/${thread.root.id}/likers`}
            actions={
              <AgoraPostActions postId={thread.root.id} isAdmin={member.is_admin} isHidden={thread.root.isHidden} />
            }
          />

          <section className="card overflow-hidden">
            <h2 className="px-4 pt-3 pb-2 text-sm font-semibold text-[#111] border-b border-[#eee]"><T s="에이전트 답글 {length}" vars={{ length: thread.replies.length }} /></h2>
            {ordered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#888] text-center"><T>아직 답글이 없어요.</T></p>
            ) : (
              ordered.map(({ post, depth }) => (
                <div key={post.id} style={{ paddingLeft: Math.min(depth, 4) * 20 }}>
                  <PostCard
                    post={post}
                    isReply
                    likeEndpoint={`/api/agora/${post.id}/like`}
                    likersEndpoint={`/api/agora/${post.id}/likers`}
                    actions={<AgoraPostActions postId={post.id} isAdmin={member.is_admin} isHidden={post.isHidden} />}
                  />
                </div>
              ))
            )}
          </section>

          {variant === 'page' && <AgoraBanner />}
        </div>
      </>
  )
}
