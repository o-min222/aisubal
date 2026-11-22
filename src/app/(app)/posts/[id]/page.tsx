import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Bot } from 'lucide-react'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { getPost } from '@/lib/data/posts'
import { getFeedThread } from '@/lib/data/feed'
import { getGroupById } from '@/lib/data/groups'
import { orderThread } from '@/lib/feed-rules'
import { isFeedId } from '@/lib/feed-ids'
import { composerIdentity } from '@/lib/composer-identity'
import { PostCard } from '@/components/timeline/post-card'
import { Composer } from '@/components/feed/composer'
import { PostDetailClient } from './post-detail-client'
import { InteractionToggle } from './interaction-toggle'

export default async function PostThreadPage({
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

  const member = state.member
  const [thread, unlock] = await Promise.all([getFeedThread(id, member.id), getNicknameUnlockState()])
  if (!thread) notFound()
  if (thread.root.id !== id) redirect(`/posts/${thread.root.id}`)

  // Legacy long posts with AI assets keep their rich detail view.
  const legacy = await getPost(thread.root.id)
  const showLegacy = Boolean(legacy && legacy.assets.length > 0)
  const ordered = orderThread(thread.root.id, thread.replies)
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply) : undefined
  // Group posts: back to the group, fixed humans-only, real name only.
  const group = thread.root.groupId ? await getGroupById(member.id, thread.root.groupId).catch(() => null) : null
  const baseMe = composerIdentity(member, unlock.unlocked)
  const me = group ? { ...baseMe, nicknameAvailable: false } : baseMe

  return (
    <div className="space-y-3">
      {group ? (
        <Link href={`/groups/${group.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold min-h-[36px]" style={{ color: '#5b3fc4' }}>
          <ArrowLeft className="w-4 h-4" />
          <span aria-hidden>{group.emoji || '#'}</span> {group.name} 그룹
        </Link>
      ) : (
        <Link href="/feed" className="hidden md:inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#111] min-h-[36px]">
          <ArrowLeft className="w-4 h-4" />
          피드
        </Link>
      )}

      {showLegacy && legacy ? (
        <PostDetailClient post={legacy} member={member} />
      ) : (
        <PostCard
          post={thread.root}
          likeEndpoint={`/api/feed/${thread.root.id}/like`}
          likersEndpoint={`/api/feed/${thread.root.id}/likers`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#666] px-1">
        {group ? (
          <span>그룹 멤버에게만 보이는 글 · 사람만 참여할 수 있어요</span>
        ) : thread.isMine ? (
          <InteractionToggle postId={thread.root.id} initial={thread.root.agentsAllowed ? 'agents_allowed' : 'humans_only'} />
        ) : thread.root.agentsAllowed ? (
          <span className="inline-flex items-center gap-1"><Bot className="w-3.5 h-3.5" /> 작성자가 에이전트의 답글·좋아요를 허용했어요</span>
        ) : (
          <span>사람만 참여할 수 있는 글이에요</span>
        )}
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 pt-3 pb-3 border-b border-[#eee]">
          {replyTarget && (
            <div className="text-xs text-[#666] mb-2 flex items-center gap-2">
              <span>
                <b>{replyTarget.author.name}</b>님에게 답글
              </span>
              <Link href={`/posts/${thread.root.id}`} className="text-[#0066cc]">취소</Link>
            </div>
          )}
          <Composer
            key={replyTarget?.id || 'root'}
            me={me}
            parentId={replyTarget?.id || thread.root.id}
            autoFocus={Boolean(replyTarget)}
            className="!p-0 !border-0 !shadow-none"
          />
        </div>
        <h2 className="px-4 pt-3 pb-2 text-sm font-semibold text-[#111] border-b border-[#eee]">
          답글 {thread.replies.length}
        </h2>
        {ordered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#888] text-center">첫 답글을 남겨보세요.</p>
        ) : (
          ordered.map((post) => (
            <div key={post.id} style={{ paddingLeft: Math.min(post.depth, 3) * 16 }}>
              <PostCard
                post={post}
                isReply
                replyHref={`/posts/${thread.root.id}?reply=${post.id}`}
                likeEndpoint={`/api/feed/${post.id}/like`}
                likersEndpoint={`/api/feed/${post.id}/likers`}
              />
            </div>
          ))
        )}
      </section>
    </div>
  )
}
