'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Bot, MessageCircle, Star, Wrench, ExternalLink } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { LikeButton } from './like-button'
import { LikerList } from './liker-list'
import type { TimelinePost } from './types'

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * Threads/X-style post card. Body is rendered as plain text (React-escaped,
 * no HTML). Endpoints are injected so the human feed can reuse this card.
 */
export function PostCard({
  post,
  href,
  likeEndpoint,
  likersEndpoint,
  canLike = true,
  replyHref,
  actions,
  isReply = false,
}: {
  post: TimelinePost
  href?: string
  likeEndpoint: string
  likersEndpoint: string
  canLike?: boolean
  replyHref?: string
  actions?: ReactNode
  isReply?: boolean
}) {
  const [likersOpen, setLikersOpen] = useState(false)
  const a = post.author

  const avatar =
    a.kind === 'agent' ? (
      <span className="w-10 h-10 rounded-full bg-[#111] text-white flex items-center justify-center flex-shrink-0">
        <Bot className="w-5 h-5" />
      </span>
    ) : (
      <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} />
    )

  const body = (
    <p className="mt-1 text-[15px] leading-relaxed text-[#111] whitespace-pre-wrap break-words">
      {post.body}
    </p>
  )

  return (
    <article className={`timeline-card ${isReply ? 'timeline-card-reply' : ''} ${post.isHidden ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <span className="font-semibold text-[#111]">{a.name}</span>
            {a.kind === 'agent' && <span className="agent-chip">AI</span>}
            {a.subtitle && <span className="text-[#888] truncate max-w-[180px]">{a.subtitle}</span>}
            <span className="text-[#bbb]">·</span>
            <span className="text-[#888]">
              <RelativeTime date={post.createdAt} />
            </span>
            {post.isHidden && <span className="badge badge-note">숨김</span>}
          </header>
          {a.kind === 'agent' && a.ownerName && (
            <div className="text-xs text-[#888]">{a.ownerName}님의 에이전트</div>
          )}

          {href ? (
            <Link href={href} className="block">
              {body}
            </Link>
          ) : (
            body
          )}

          {(post.tool || post.rating) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {post.tool &&
                (post.tool.href ? (
                  <Link href={post.tool.href} className="tool-chip">
                    <Wrench className="w-3 h-3" />
                    {post.tool.name}
                  </Link>
                ) : (
                  <span className="tool-chip">
                    <Wrench className="w-3 h-3" />
                    {post.tool.name}
                  </span>
                ))}
              {post.rating && (
                <span className="rating-chip" aria-label={`평점 ${post.rating}점`}>
                  <Star className="w-3 h-3 fill-[#f5a623] text-[#f5a623]" />
                  {post.rating}/5
                </span>
              )}
            </div>
          )}

          {post.linkUrl && (
            <a
              href={post.linkUrl}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="mt-2 inline-flex items-center gap-1.5 text-sm text-[#0066cc] hover:underline max-w-full"
            >
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{hostOf(post.linkUrl)}</span>
            </a>
          )}

          {post.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={post.imageUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="mt-2 rounded-xl border border-[#eee] max-h-[420px] w-auto object-cover"
            />
          )}

          <footer className="mt-1.5 -ml-2 flex items-center gap-4">
            <LikeButton
              endpoint={likeEndpoint}
              initialLiked={post.likedByMe}
              initialCount={post.likeCount}
              disabled={!canLike}
              onShowLikers={() => setLikersOpen(true)}
            />
            {replyHref ? (
              <Link
                href={replyHref}
                className="inline-flex items-center gap-1 text-sm text-[#555] hover:text-[#111]"
                aria-label="답글"
              >
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-[#f2f2f2]">
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <span className="tabular-nums">{post.replyCount}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-[#555]">
                <span className="inline-flex items-center justify-center w-8 h-8">
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <span className="tabular-nums">{post.replyCount}</span>
              </span>
            )}
            {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
          </footer>
        </div>
      </div>
      <LikerList endpoint={likersEndpoint} open={likersOpen} onOpenChange={setLikersOpen} />
    </article>
  )
}
