import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { getUserState } from '@/lib/auth'
import { getAnonThread } from '@/lib/data/anon'
import { orderThread } from '@/lib/feed-rules'
import { isFeedId } from '@/lib/feed-ids'
import { PostCard } from '@/components/timeline/post-card'
import { AnonComposer } from '@/components/anon/anon-composer'
import { AnonActions } from '@/components/anon/anon-actions'

export const metadata = { title: '익명 · AI쓰발' }

export default async function AnonThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ reply?: string }>
}) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const { id } = await params
  const { reply } = await searchParams
  if (!isFeedId(id)) notFound()

  const thread = await getAnonThread(id, state.member.id)
  if (!thread) notFound()
  if (thread.root.id !== id) redirect(`/anon/${thread.root.id}`)

  const ordered = orderThread(thread.root.id, thread.replies)
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply && !r.isDeleted && !r.isHidden) : undefined
  const rootGone = Boolean(thread.root.isDeleted)

  return (
    <div className="space-y-3">
      <Link href="/anon" className="inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#111] min-h-[40px] px-1">
        <ArrowLeft className="w-4 h-4" />
        익명 라운지
      </Link>

      <PostCard
        post={thread.root}
        likeEndpoint={`/api/anon/${thread.root.id}/like`}
        likersEndpoint={`/api/anon/${thread.root.id}/likers`}
        actions={<AnonActions post={thread.root} afterDelete="/anon" />}
      />

      <section className="card overflow-hidden">
        {!rootGone && (
          <div className="px-4 pt-3 pb-3 border-b border-[#eee]">
            {replyTarget && (
              <div className="text-xs text-[#666] mb-2 flex items-center gap-2">
                <span>
                  <b>{replyTarget.author.name}</b>에게 답글
                </span>
                <Link href={`/anon/${thread.root.id}`} className="text-[#0066cc] min-h-[32px] inline-flex items-center">
                  취소
                </Link>
              </div>
            )}
            <AnonComposer
              key={replyTarget?.id || 'root'}
              parentId={replyTarget?.id || thread.root.id}
              autoFocus={Boolean(replyTarget)}
              className="!p-0 !border-0 !shadow-none"
            />
          </div>
        )}
        <div className="px-4 pt-3 pb-2 text-sm font-semibold text-[#111] border-b border-[#eee]">
          답글 {thread.replies.filter((r) => !r.isDeleted).length}
        </div>
        {ordered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#888] text-center">첫 답글을 남겨보세요.</p>
        ) : (
          ordered.map((post) => (
            <div key={post.id} style={{ paddingLeft: Math.min(post.depth, 3) * 16 }}>
              <PostCard
                post={post}
                isReply
                replyHref={post.isDeleted || post.isHidden || rootGone ? undefined : `/anon/${thread.root.id}?reply=${post.id}`}
                likeEndpoint={`/api/anon/${post.id}/like`}
                likersEndpoint={`/api/anon/${post.id}/likers`}
                actions={post.isHidden ? undefined : <AnonActions post={post} />}
              />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
