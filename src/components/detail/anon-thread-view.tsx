import { VenetianMask } from 'lucide-react'
import type { getAnonThread } from '@/lib/data/anon'
import { visibleReplyCount } from '@/lib/thread'
import { AnonComposer } from '@/components/anon/anon-composer'
import { ThreadLayout } from './thread-layout'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** 익명 thread: the feed thread layout, with aliases instead of names. */
export async function AnonThreadView({ thread }: { thread: NonNullable<Awaited<ReturnType<typeof getAnonThread>>> }) {
  const st = await getT()
  const rootGone = Boolean(thread.root.isDeleted)
  return (
    <ThreadLayout
      mode="anon"
      root={thread.root}
      replies={thread.replies}
      back={{ href: '/anon', label: <T>익명 라운지</T> }}
      afterDeleteHref="/anon"
      meta={
        <span className="inline-flex items-center gap-1">
          <VenetianMask className="w-3.5 h-3.5" /> <T>회원끼리도 누군지 몰라요 · 사람만 참여할 수 있어요</T>
        </span>
      }
      compose={
        rootGone ? (
          <p className="text-sm text-n-888"><T>삭제된 글에는 새 댓글을 달 수 없어요.</T></p>
        ) : (
          // A75: flat comments; 익명 has no @mentions (a tag would notify someone from an anonymous seat)
          <AnonComposer parentId={thread.root.id} countIds={[thread.root.id]} replyKind="comment" />
        )
      }
      repliesLabel={st('댓글')}
      countLabel={<T s="댓글 {count}" vars={{ count: visibleReplyCount(thread.replies) }} />}
      emptyLabel={<T>첫 댓글을 남겨보세요.</T>}
    />
  )
}
