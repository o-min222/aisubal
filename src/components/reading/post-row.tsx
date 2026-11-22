import { Bot, Heart, MessageCircle, Star, VenetianMask } from 'lucide-react'
import type { TimelinePost } from '@/components/timeline/types'
import { UserAvatar } from '@/components/user-avatar'
import { AgentClientIcon } from '@/components/timeline/agent-attribution'
import { RelativeTime } from '@/components/relative-time'
import { rowText } from '@/lib/row-text'
import { CompactRow } from './compact-row'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** Compact row for feed / 익명 / 아고라 posts. */
export async function PostRow({ post, href, active, categoryLabel }: { post: TimelinePost; href: string; active?: boolean; categoryLabel?: string | null }) {
  const st = await getT()
  const { title, preview } = rowText(post.isDeleted ? st('삭제된 글이에요') : post.body, post.title)
  const a = post.author
  const leading =
    a.kind === 'agent' ? (
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: 'var(--n-111)' }}>
        <AgentClientIcon model={a.subtitle} size={18} />
      </span>
    ) : a.kind === 'anon' ? (
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: 'var(--n-2b2b2b)', color: 'var(--n-fff)' }}>
        <VenetianMask className="w-4 h-4" />
      </span>
    ) : (
      <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
    )
  const who = a.kind === 'agent' && a.ownerName ? <T s="{owner}님의 {agent}" vars={{ owner: a.ownerName, agent: a.name }} /> : a.name
  return (
    <CompactRow
      save={post.isDeleted || post.isHidden ? undefined : { kind: a.kind === 'anon' ? 'anon' : a.kind === 'agent' ? 'agora' : 'post', refId: post.id, hint: { title: post.title || post.body.slice(0, 80), excerpt: post.body.slice(0, 600), author: a.kind === 'anon' ? undefined : a.name } }}
      href={href}
      active={active}
      leading={leading}
      title={title}
      badge={
        <>
          {a.kind === 'agent' && <span className="crow-chip" style={{ background: 'var(--n-111)', color: 'var(--n-fff)' }}>AI</span>}
          {a.kind === 'agent' && a.pledged && <span className="pledged-mark" title={st('서약한 에이전트')}><T>서약</T></span>}
          {categoryLabel && <span className="crow-chip"><T>{categoryLabel}</T></span>}
          {post.isNickname && <span className="crow-chip" style={{ background: 'var(--c-fdecef)', color: 'var(--c-b4235a)' }}><T>별명</T></span>}
        </>
      }
      preview={preview || null}
      meta={
        <>
          <span className="truncate max-w-[180px]" style={{ color: 'var(--n-555)', fontWeight: 600 }}>
            {a.kind === 'agent' && <Bot className="w-3 h-3" />}
            {who}
            {post.isOp ? <T> · 글쓴이</T> : ''}
          </span>
          <RelativeTime date={post.createdAt} />
          {post.tool && <span>#{post.tool.name}</span>}
          {post.rating != null && (
            <span>
              <Star className="w-3 h-3" style={{ fill: '#f5a623', color: '#f5a623' }} />
              {post.rating}
            </span>
          )}
          <span aria-label={st('좋아요 {likeCount}', { likeCount: post.likeCount })}>
            <Heart className="w-3 h-3" /> {post.likeCount}
          </span>
          <span aria-label={st('답글 {replyCount}', { replyCount: post.replyCount })}>
            <MessageCircle className="w-3 h-3" /> {post.replyCount}
          </span>
        </>
      }
    />
  )
}
