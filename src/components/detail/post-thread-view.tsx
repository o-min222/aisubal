import Link from 'next/link'
import { ArrowLeft, Bot, BotOff } from 'lucide-react'
import { getNicknameUnlockState } from '@/lib/auth'
import { getPost } from '@/lib/data/posts'
import { getFeedThread } from '@/lib/data/feed'
import { getGroupById } from '@/lib/data/groups'
import { twoLevelThread, visibleReplyCount } from '@/lib/thread'
import { CommentList } from '@/components/comments/comment-list'
import { composerIdentity } from '@/lib/composer-identity'
import type { Member } from '@/lib/supabase/types'
import { PostCard } from '@/components/timeline/post-card'
import { Composer } from '@/components/feed/composer'
import { PostDetailClient } from '@/app/(app)/posts/[id]/post-detail-client'
import { InteractionToggle } from '@/app/(app)/posts/[id]/interaction-toggle'
import { AuthorshipToggle } from '@/app/(app)/posts/[id]/authorship-toggle'
import { T } from '@/i18n/t'
import { GroupAvatar } from '@/components/groups/group-avatar'


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
  const groups = twoLevelThread(thread.root.id, thread.replies)
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply && !r.isDeleted) : undefined
  const group = thread.root.groupId ? await getGroupById(member.id, thread.root.groupId).catch(() => null) : null
  const baseMe = composerIdentity(member, unlock.unlocked)
  const me = group ? { ...baseMe, nicknameAvailable: false } : baseMe
  const pageHref = `/posts/${thread.root.id}`

  return (
    <div className="space-y-3">
      {variant === 'page' &&
        (group ? (
          <Link href={`/groups/${group.slug}`} className="inline-flex items-center gap-1.5 text-sm font-semibold min-h-[36px] text-n-555 hover:text-n-111">
            <ArrowLeft className="w-4 h-4" />
            <GroupAvatar name={group.name} size={16} className="align-[-3px]" /> <T s="{name} 그룹" vars={{ name: group.name }} />
          </Link>
        ) : (
          <Link href="/feed" className="hidden md:inline-flex items-center gap-1 text-sm text-n-666 hover:text-n-111 min-h-[36px]">
            <ArrowLeft className="w-4 h-4" />
            <T>피드</T>
          </Link>
        ))}

      {showLegacy && legacy ? (
        <PostDetailClient post={legacy} member={member} />
      ) : (
        <PostCard post={thread.root} afterDeleteHref={group ? `/groups/${group.slug}` : '/feed'} likeEndpoint={`/api/feed/${thread.root.id}/like`} likersEndpoint={`/api/feed/${thread.root.id}/likers`} />
      )}

      <div className="flex flex-wrap items-center gap-2 text-xs text-n-666 px-1">
        {group ? (
          <>
            <span><T>그룹 멤버에게만 보이는 글 · 사람만 참여할 수 있어요</T></span>
            {thread.isMine && !thread.root.isDeleted && <AuthorshipToggle postId={thread.root.id} initial={thread.root.authorship ?? 'human'} />}
          </>
        ) : thread.isMine ? (
          <>
            <InteractionToggle postId={thread.root.id} initial={thread.root.agentsAllowed ? 'agents_allowed' : 'humans_only'} />
            {!thread.root.isDeleted && <AuthorshipToggle postId={thread.root.id} initial={thread.root.authorship ?? 'human'} />}
          </>
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
        <div className="px-4 pt-3 pb-3 border-b border-n-eee">
          {replyTarget && (
            <div className="text-xs text-n-666 mb-2 flex items-center gap-2">
              <span>
                <T s="{name}님에게 답글" vars={{ name: <b>{replyTarget.author.name}</b> }} />
              </span>
              <Link href={pageHref} className="text-c-06c">
                <T>취소</T>
              </Link>
            </div>
          )}
          {thread.root.isDeleted && !replyTarget ? (
            <p className="text-sm text-n-888"><T>삭제된 글에는 새 댓글을 달 수 없어요.</T></p>
          ) : (
          <Composer
            key={replyTarget?.id || 'root'}
            me={me}
            parentId={replyTarget?.id || thread.root.id}
            countIds={[thread.root.id, ...(replyTarget ? [replyTarget.parentId === thread.root.id ? replyTarget.id : replyTarget.parentId!] : [])]}
            replyKind={replyTarget ? 'reply' : 'comment'}
            autoFocus={Boolean(replyTarget)}
            className="!p-0 !border-0 !shadow-none"
          />
          )}
        </div>
        <h2 className="px-4 pt-3 pb-2 !text-sm font-semibold text-n-111 border-b border-n-eee"><T s="댓글 {count}" vars={{ count: visibleReplyCount(thread.replies) }} /></h2>
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
                replyHref={post.isDeleted ? undefined : `${pageHref}?reply=${post.id}`}
                likeEndpoint={`/api/feed/${post.id}/like`}
                likersEndpoint={`/api/feed/${post.id}/likers`}
              />
            )}
          />
        )}
      </section>
    </div>
  )
}
