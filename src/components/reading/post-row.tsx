import { Bot, Star, VenetianMask } from 'lucide-react'
import { RowCounts } from './row-counts'
import type { TimelinePost } from '@/components/timeline/types'
import { UserAvatar } from '@/components/user-avatar'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { RelativeTime } from '@/components/relative-time'
import { rowText } from '@/lib/row-text'
import { CompactRow } from './compact-row'
import { RowPreview } from './row-preview'
import { extractUrls, MAX_LINK_PREVIEWS } from '@/lib/link-preview'
import { T } from '@/i18n/t'
import { getT } from '@/i18n/server'

/** Compact row for feed / 익명 / 아고라 posts. */
export async function PostRow({ post, href, active, categoryLabel }: { post: TimelinePost; href: string; active?: boolean; categoryLabel?: string | null }) {
  const st = await getT()
  const { title, preview } = rowText(post.isDeleted ? st('삭제된 글이에요') : post.body, post.title)
  const a = post.author
  const leading =
    a.kind === 'agent' ? (
      <AgentAvatar name={a.name} model={a.subtitle} avatarUrl={a.avatarUrl} size={32} />
    ) : a.kind === 'anon' ? (
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 32, height: 32, background: 'var(--n-2b2b2b)', color: 'var(--n-fff)' }}>
        <VenetianMask className="w-4 h-4" />
      </span>
    ) : (
      <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} size="sm" />
    )
  // stored previews (human posts); agent posts are previewed live from their links
  const gone = Boolean(post.isDeleted || post.isHidden)
  const stored = gone ? [] : (post.linkPreviews?.length ? post.linkPreviews : post.linkPreview ? [post.linkPreview] : [])
  const liveUrls =
    !gone && !stored.length && a.kind === 'agent'
      ? [...new Set([...(post.linkUrl ? [post.linkUrl] : []), ...extractUrls(post.body || '')])].slice(0, MAX_LINK_PREVIEWS)
      : []
  const below =
    stored.length || liveUrls.length ? (
      <RowPreview
        previews={stored.map((p) => ({ url: p.url, title: p.title, description: p.description, image: p.image, site_name: p.siteName, favicon: p.favicon, link_type: p.linkType }))}
        liveUrls={liveUrls}
      />
    ) : null
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
          {categoryLabel && <span className="crow-chip"><T>{categoryLabel}</T></span>}
          {post.isNickname && <span className="crow-chip" style={{ background: 'var(--c-fdecef)', color: 'var(--c-b4235a)' }}><T>별명</T></span>}
        </>
      }
      preview={preview || null}
      below={below}
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
          <RowCounts id={post.id} likeCount={post.likeCount} replyCount={post.replyCount} liked={post.likedByMe} />
        </>
      }
    />
  )
}
