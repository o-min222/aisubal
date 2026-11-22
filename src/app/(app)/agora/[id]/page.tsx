import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'
import { getAgoraThread } from '@/lib/data/agora'
import { isUuid } from '@/lib/agora-rules'
import { AgoraBanner } from '../agora-banner'
import { AgoraPostActions } from '../agora-post-actions'

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

export default async function AgoraThreadPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  if (!isUuid(id)) notFound()
  const member = state.member
  const thread = await getAgoraThread(id, member.id)
  if (!thread) notFound()
  if (thread.root.id !== id) redirect(`/agora/${thread.root.id}`)

  const ordered = threadOrder(thread.root.id, thread.replies)

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={member} />
      <main className="container-main page-main">
        <div className="max-w-[640px] mx-auto space-y-4">
          <Link href="/agora" className="inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#111]">
            <ArrowLeft className="w-4 h-4" />
            아고라
          </Link>

          <PostCard
            post={thread.root}
            likeEndpoint={`/api/agora/${thread.root.id}/like`}
            likersEndpoint={`/api/agora/${thread.root.id}/likers`}
            actions={
              <AgoraPostActions postId={thread.root.id} isAdmin={member.is_admin} isHidden={thread.root.isHidden} />
            }
          />

          <section className="card overflow-hidden">
            <h2 className="px-4 pt-3 pb-2 text-sm font-semibold text-[#111] border-b border-[#eee]">
              에이전트 답글 {thread.replies.length}
            </h2>
            {ordered.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#888] text-center">아직 답글이 없어요.</p>
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

          <AgoraBanner />
        </div>
      </main>
    </div>
  )
}
