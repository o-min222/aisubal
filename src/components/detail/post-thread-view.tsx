import type { ReactNode } from 'react'
import Link from 'next/link'
import { Bot, BotOff } from 'lucide-react'
import { getPost } from '@/lib/data/posts'
import { getFeedThread } from '@/lib/data/feed'
import { getGroupById } from '@/lib/data/groups'
import { visibleReplyCount } from '@/lib/thread'
import { composerIdentity } from '@/lib/composer-identity'
import type { Member } from '@/lib/supabase/types'
import { ThreadLayout } from './thread-layout'
import { Composer } from '@/components/feed/composer'
import { PostDetailClient } from '@/app/(app)/posts/[id]/post-detail-client'
import { InteractionToggle } from '@/app/(app)/posts/[id]/interaction-toggle'
import { VisibilityToggle } from '@/app/(app)/posts/[id]/visibility-toggle'
import { canRestrict, POST_VISIBILITY_OPTION } from '@/lib/post-visibility'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'
import { GroupAvatar } from '@/components/groups/group-avatar'


/** A human-feed thread. Used by /posts/[id] and the feed / group / profile reading panes. */
export async function PostThreadView({
  thread,
  member,
  reply,
  variant = 'page',
  rootNode,
  meta,
  pageHref: pageHrefProp,
}: {
  thread: NonNullable<Awaited<ReturnType<typeof getFeedThread>>>
  member: Member
  reply?: string
  variant?: 'page' | 'pane'
  /** A29: a 모임 shows its own card in place of the thread post, and keeps ?reply= on its page */
  rootNode?: ReactNode
  meta?: ReactNode
  pageHref?: string
}) {
  const [st, legacy, group] = await Promise.all([
    getT(),
    getPost(thread.root.id),
    thread.root.groupId ? getGroupById(member.id, thread.root.groupId).catch(() => null) : null,
  ])
  const showLegacy = Boolean(legacy && legacy.assets.length > 0)
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply && !r.isDeleted) : undefined
  const me = composerIdentity(member)
  const pageHref = pageHrefProp ?? `/posts/${thread.root.id}`

  const groupBack = group ? (
    <>
      <GroupAvatar name={group.name} size={16} className="align-[-3px]" /> <T s="{name} 그룹" vars={{ name: group.name }} />
    </>
  ) : null

  return (
    <ThreadLayout
      mode="feed"
      root={thread.root}
      replies={thread.replies}
      back={variant === 'page' ? (group ? { href: `/groups/${group.slug}`, label: groupBack } : { href: '/feed', label: <T>피드</T> }) : undefined}
      rootNode={rootNode ?? (showLegacy && legacy ? <PostDetailClient post={legacy} member={member} /> : undefined)}
      afterDeleteHref={group ? `/groups/${group.slug}` : '/feed'}
      openId={reply}
      meta={
        meta ?? (group ? (
          <span><T>그룹 멤버에게만 보이는 글 · 사람만 참여할 수 있어요</T></span>
        ) : thread.isMine ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {thread.root.author.kind === 'member' && canRestrict({ isReply: false, groupId: thread.root.groupId, postedAs: thread.root.isNickname ? 'nickname' : 'real' }) && (
              <VisibilityToggle postId={thread.root.id} initial={thread.root.visibility ?? 'members'} />
            )}
            <InteractionToggle postId={thread.root.id} initial={thread.root.agentsAllowed ? 'agents_allowed' : 'humans_only'} />
          </span>
        ) : thread.root.visibility && thread.root.visibility !== 'members' ? (
          <span className="inline-flex items-center gap-1">
            <T>{POST_VISIBILITY_OPTION[thread.root.visibility].title}</T> <span aria-hidden>·</span> {thread.root.agentsAllowed ? <T>에이전트 반응 허용</T> : <T>에이전트 반응 끔</T>}
          </span>
        ) : thread.root.agentsAllowed ? (
          <span className="inline-flex items-center gap-1">
            <Bot className="w-3.5 h-3.5" /> <T>에이전트 반응 허용</T>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <BotOff className="w-3.5 h-3.5" /> <T>에이전트 반응 끔</T>
          </span>
        ))
      }
      compose={
        <>
          {replyTarget && (
            <div className="text-xs text-n-666 mb-2 flex items-center gap-2">
              <span>
                <T s="{name}님에게 답글" vars={{ name: <b>{replyTarget.author.name}</b> }} />
              </span>
              <Link href={pageHref} className="text-link">
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
            />
          )}
        </>
      }
      repliesLabel={st('댓글')}
      countLabel={<T s="댓글 {count}" vars={{ count: visibleReplyCount(thread.replies) }} />}
      emptyLabel={<T>첫 댓글을 남겨보세요.</T>}
      replyHref={(p) => (p.isDeleted ? undefined : `${pageHref}?reply=${p.id}`)}
    />
  )
}
