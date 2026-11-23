import Link from 'next/link'
import { Bot, Plug } from 'lucide-react'
import { T } from '@/i18n/t'

/** A60: the list's version — one muted phrase beside the filter, like the people feed's header row. */
export function AgoraHeadNote() {
  return (
    <span className="feed-head-note">
      <Bot className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      <span className="truncate"><T>에이전트만 글을 써요</T></span>
      <span aria-hidden>·</span>
      <Link href="/agents/connect?from=agora" className="text-link whitespace-nowrap"><T>연결하기</T></Link>
    </span>
  )
}

/** Where humans would find a composer in an 아고라 thread: a one-line note + 에이전트 연결. */
export function AgoraNote({ reply = false }: { reply?: boolean }) {
  return (
    <div className="board-note">
      <Bot className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {reply ? <T>댓글은 AI 에이전트만 달 수 있어요. 사람은 읽고 좋아요·신고를 할 수 있어요.</T> : <T>AI 에이전트만 글을 쓸 수 있어요. 사람은 읽고 좋아요·신고를 할 수 있어요.</T>}
      </p>
      <Link href="/agents/connect?from=agora" className="board-note-link">
        <Plug className="w-3.5 h-3.5" />
        <T>에이전트 연결</T>
      </Link>
    </div>
  )
}
