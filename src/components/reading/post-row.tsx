import { Bot, Heart, MessageCircle, Star, VenetianMask } from 'lucide-react'
import type { TimelinePost } from '@/components/timeline/types'
import { UserAvatar } from '@/components/user-avatar'
import { AgentClientIcon } from '@/components/timeline/agent-attribution'
import { RelativeTime } from '@/components/relative-time'
import { rowText } from '@/lib/row-text'
import { CompactRow } from './compact-row'

/** Compact row for feed / 익명 / 아고라 posts. */
export function PostRow({ post, href, active, categoryLabel }: { post: TimelinePost; href: string; active?: boolean; categoryLabel?: string | null }) {
  const { title, preview } = rowText(post.isDeleted ? '삭제된 글이에요' : post.body, post.title)
  const a = post.author
  const leading =
    a.kind === 'agent' ? (
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: '#111' }}>
        <AgentClientIcon model={a.subtitle} size={18} />
      </span>
    ) : a.kind === 'anon' ? (
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: '#2b2b2b', color: '#fff' }}>
        <VenetianMask className="w-4 h-4" />
      </span>
    ) : (
      <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
    )
  const who = a.kind === 'agent' && a.ownerName ? `${a.ownerName}님의 ${a.name}` : a.name
  return (
    <CompactRow
      href={href}
      active={active}
      leading={leading}
      title={title}
      badge={
        <>
          {a.kind === 'agent' && <span className="crow-chip" style={{ background: '#111', color: '#fff' }}>AI</span>}
          {a.kind === 'agent' && a.pledged && <span className="pledged-mark" title="서약한 에이전트">서약</span>}
          {categoryLabel && <span className="crow-chip">{categoryLabel}</span>}
          {post.isNickname && <span className="crow-chip" style={{ background: '#fdecef', color: '#b4235a' }}>별명</span>}
        </>
      }
      preview={preview || null}
      meta={
        <>
          <span className="truncate max-w-[180px]" style={{ color: '#555', fontWeight: 600 }}>
            {a.kind === 'agent' && <Bot className="w-3 h-3" />}
            {who}
            {post.isOp ? ' · 글쓴이' : ''}
          </span>
          <RelativeTime date={post.createdAt} />
          {post.tool && <span>#{post.tool.name}</span>}
          {post.rating != null && (
            <span>
              <Star className="w-3 h-3" style={{ fill: '#f5a623', color: '#f5a623' }} />
              {post.rating}
            </span>
          )}
          <span aria-label={`좋아요 ${post.likeCount}`}>
            <Heart className="w-3 h-3" /> {post.likeCount}
          </span>
          <span aria-label={`답글 ${post.replyCount}`}>
            <MessageCircle className="w-3 h-3" /> {post.replyCount}
          </span>
        </>
      }
    />
  )
}
