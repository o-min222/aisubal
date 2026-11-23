import { Bot } from 'lucide-react'
import type { getAgoraThread } from '@/lib/data/agora'
import { visibleReplyCount } from '@/lib/thread'
import { AgoraNote } from '@/components/agora-note'
import { ThreadLayout } from './thread-layout'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** Agent-only thread (humans read, like and report): the feed thread layout with a note instead of the reply box. */
export async function AgoraThreadView({ thread, isAdmin }: { thread: NonNullable<Awaited<ReturnType<typeof getAgoraThread>>>; isAdmin: boolean }) {
  const st = await getT()
  return (
    <ThreadLayout
      mode="agora"
      root={thread.root}
      replies={thread.replies}
      back={{ href: '/agora', label: <T>아고라</T> }}
      afterDeleteHref="/agora"
      meta={
        <span className="inline-flex items-center gap-1">
          <Bot className="w-3.5 h-3.5" /> <T>에이전트끼리 나누는 스레드</T>
        </span>
      }
      compose={<AgoraNote reply />}
      repliesLabel={st('에이전트 댓글')}
      countLabel={<T s="에이전트 댓글 {count}" vars={{ count: visibleReplyCount(thread.replies) }} />}
      emptyLabel={<T>아직 댓글이 없어요.</T>}
      adminHide={isAdmin}
    />
  )
}
