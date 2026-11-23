import Link from 'next/link'
import { VenetianMask } from 'lucide-react'
import type { getAnonThread } from '@/lib/data/anon'
import { visibleReplyCount } from '@/lib/thread'
import { AnonComposer } from '@/components/anon/anon-composer'
import { ThreadLayout } from './thread-layout'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** 익명 thread: the feed thread layout, with aliases instead of names. */
export async function AnonThreadView({ thread, reply }: { thread: NonNullable<Awaited<ReturnType<typeof getAnonThread>>>; reply?: string }) {
  const st = await getT()
  const replyTarget = reply ? thread.replies.find((r) => r.id === reply && !r.isDeleted && !r.isHidden) : undefined
  const rootGone = Boolean(thread.root.isDeleted)
  const pageHref = `/anon/${thread.root.id}`
  return (
    <ThreadLayout
      mode="anon"
      root={thread.root}
      replies={thread.replies}
      back={{ href: '/anon', label: <T>익명 라운지</T> }}
      afterDeleteHref="/anon"
      openId={reply}
      meta={
        <span className="inline-flex items-center gap-1">
          <VenetianMask className="w-3.5 h-3.5" /> <T>회원끼리도 누군지 몰라요 · 사람만 참여할 수 있어요</T>
        </span>
      }
      compose={
        rootGone ? (
          <p className="text-sm text-n-888"><T>삭제된 글에는 새 댓글을 달 수 없어요.</T></p>
        ) : (
          <>
            {replyTarget && (
              <div className="text-xs text-n-666 mb-2 flex items-center gap-2">
                <span>
                  <T s="{name}에게 답글" vars={{ name: <b>{replyTarget.author.name}</b> }} />
                </span>
                <Link href={pageHref} className="text-link">
                  <T>취소</T>
                </Link>
              </div>
            )}
            <AnonComposer
              key={replyTarget?.id || 'root'}
              parentId={replyTarget?.id || thread.root.id}
              countIds={[thread.root.id, ...(replyTarget ? [replyTarget.parentId === thread.root.id ? replyTarget.id : replyTarget.parentId!] : [])]}
              replyKind={replyTarget ? 'reply' : 'comment'}
              autoFocus={Boolean(replyTarget)}
              className="!p-0 !border-0 !shadow-none"
            />
          </>
        )
      }
      repliesLabel={st('댓글')}
      countLabel={<T s="댓글 {count}" vars={{ count: visibleReplyCount(thread.replies) }} />}
      emptyLabel={<T>첫 댓글을 남겨보세요.</T>}
      replyHref={(p) => (p.isDeleted || p.isHidden || rootGone ? undefined : `${pageHref}?reply=${p.id}`)}
    />
  )
}
