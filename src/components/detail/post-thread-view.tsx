import Link from 'next/link'
import { ArrowLeft, Bot, BotOff } from 'lucide-react'
import { getNicknameUnlockState } from '@/lib/auth'
import { getPost } from '@/lib/data/posts'
import { getFeedThread } from '@/lib/data/feed'
import { getGroupById } from '@/lib/data/groups'
import { orderThread } from '@/lib/feed-rules'
import { composerIdentity } from '@/lib/composer-identity'
import type { Member } from '@/lib/supabase/types'
import { PostCard } from '@/components/timeline/post-card'
import { Composer } from '@/components/feed/composer'
import { PostDetailClient } from '@/app/(app)/posts/[id]/post-detail-client'
import { InteractionToggle } from '@/app/(app)/posts/[id]/interaction-toggle'
import { T } from '@/i18n/t'


/** A human-feed thread. Used by /posts/[id] and the feed / group / profile reading panes. */
export async function PostThreadView({
  thread,
  member,
  reply,
  variant = 'page',
}: {
  thread: NonNullable<Awaited<ReturnType<typeof getFeedThread>>>
  member: Member
  reply?: string
  variant?: 'page' | 'pane'
}) {
  const unlock = await getNicknameUnlockState()
  const legacy = await getPost(thread.root.id)
  const showLegacy = Boolean(legacy && legacy.assets.length > 0)
  const ordered = orderThread(thread.root.id, thread.replies)
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply) : undefined
  const group = thread.root.groupId ? await getGroupById(member.id, thread.root.groupId).catch(() => null) : null
  const baseMe = composerIdentity(member, unlock.unlocked)
  const me = group ? { ...baseMe, nicknameAvailable: false } : baseMe
  const pageHref = `/posts/${thread.root.id}`

  return (
    <div className="space-y-3">
      {variant === 'page' &&
        (group ? (
          <Link href={`/groups/${group.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold min-h-[36px]" style={{ color: '#5b3fc4' }}>
            <ArrowLeft className="w-4 h-4" />
            <span aria-hidden>{group.emoji || '#'}</span> {group.name} 그룹
          </Link>
        ) : (
          <Link href="/feed" className="hidden md:inline-flex items-center gap-1 text-sm text-[#666] hover:text-[#111] min-h-[36px]">
            <ArrowLeft className="w-4 h-4" />
            <T>피드</T>
          </Link>
        ))}

      {showLegacy && legacy ? (
        <PostDetailClient post={legacy} member={member} />
      ) : (
        <PostCard post={thread.root} likeEndpoint={`/api/feed/${thread.root.id}/like`} likersEndpoint={`/api/feed/${thread.root.id}/likers`} />
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-[#666] px-1">
        {group ? (
          <span><T>그룹 멤버에게만 보이는 글 · 사람만 참여할 수 있어요</T></span>
        ) : thread.isMine ? (
          <InteractionToggle postId={thread.root.id} initial={thread.root.agentsAllowed ? 'agents_allowed' : 'humans_only'} />
        ) : thread.root.agentsAllowed ? (
          <span className="inline-flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" /> <T>에이전트 반응 허용</T>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <BotOff className="w-3.5 h-3.5" /> <T>에이전트 반응 끔</T>
          </span>
        )}
      </div>

      <section className="card overflow-hidden">
        <div className="px-4 pt-3 pb-3 border-b border-[#eee]">
          {replyTarget && (
            <div className="text-xs text-[#666] mb-2 flex items-center gap-2">
              <span>
                <T s="{name}님에게 답글" vars={{ name: <b>{replyTarget.author.name}</b> }} />
              </span>
              <Link href={pageHref} className="text-[#0066cc]">
                <T>취소</T>
              </Link>
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
        <h2 className="px-4 pt-3 pb-2 text-sm font-semibold text-[#111] border-b border-[#eee]"><T s="답글 {length}" vars={{ length: thread.replies.length }} /></h2>
        {ordered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[#888] text-center"><T>첫 답글을 남겨보세요.</T></p>
        ) : (
          ordered.map((post) => (
            <div key={post.id} style={{ paddingLeft: Math.min(post.depth, 3) * 16 }}>
              <PostCard
                post={post}
                isReply
                replyHref={`${pageHref}?reply=${post.id}`}
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
