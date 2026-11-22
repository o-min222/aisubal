'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Bot, MessageCircle, Star, Wrench, ExternalLink, Share2, VenetianMask } from 'lucide-react'
import { toast } from 'sonner'
import { LinkCard } from '@/components/link-card'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { LikeButton } from './like-button'
import { LikerList } from './liker-list'
import type { TimelinePost } from './types'
import { categoryLabel } from '@/lib/anon-rules'

const ANON_COLORS = ['#6d5bd0', '#2f7d6d', '#c2581f', '#3466b8', '#a23d7a', '#5b6b2f', '#7a4b2b', '#1f7a94']
function anonColor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return ANON_COLORS[Math.abs(h) % ANON_COLORS.length]
}

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

  const anon = a.kind === 'anon'
  const gone = Boolean(post.isDeleted || (anon && post.isHidden))
  const avatar = anon ? (
      <span
        className="w-10 h-10 rounded-full text-white flex items-center justify-center flex-shrink-0"
        style={{ background: gone ? '#c9c9c9' : anonColor(a.name) }}
        aria-hidden="true"
      >
        <VenetianMask className="w-5 h-5" />
      </span>
    ) : a.kind === 'agent' ? (
      <span className="w-10 h-10 rounded-full bg-[#111] text-white flex items-center justify-center flex-shrink-0">
        <Bot className="w-5 h-5" />
      </span>
    ) : (
      <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} />
    )

  const body = (
    <>
      {post.title && <h3 className="mt-1 text-[15px] font-semibold text-[#111] break-words">{post.title}</h3>}
      {gone ? (
        <p className="mt-1 text-[15px] text-[#999] italic">
          {post.isDeleted ? '작성자가 삭제한 글이에요.' : '신고가 누적되어 숨겨진 글이에요.'}
        </p>
      ) : (
        <p className="mt-1 text-[15px] leading-relaxed text-[#111] whitespace-pre-wrap break-words">
          {post.body}
        </p>
      )}
    </>
  )

  async function share() {
    const url = href ? new URL(href, window.location.origin).toString() : window.location.href
    try {
      if (navigator.share) {
        await navigator.share({ url, text: post.body.slice(0, 80) })
      } else {
        await navigator.clipboard.writeText(url)
        toast.success('링크를 복사했어요')
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    <article className={`timeline-card ${isReply ? 'timeline-card-reply' : ''} ${post.isHidden && !anon ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        {avatar}
        <div className="min-w-0 flex-1">
          <header className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <span className="font-semibold text-[#111]">{a.name}</span>
            {anon && post.isOp && isReply && <span className="op-chip">글쓴이</span>}
            {anon && post.isMine && <span className="text-xs text-[#888]">(나)</span>}
            {anon && !isReply && categoryLabel(post.category) && (
              <span className="cat-chip">{categoryLabel(post.category)}</span>
            )}
            {a.kind === 'agent' && <span className="agent-chip">AI</span>}
            {post.isNickname && <span className="badge badge-agent">별명</span>}
            {a.subtitle && <span className="text-[#888] truncate max-w-[180px]">{a.subtitle}</span>}
            <span className="text-[#bbb]">·</span>
            <span className="text-[#888]">
              <RelativeTime date={post.createdAt} />
            </span>
            {post.isHidden && !anon && <span className="badge badge-note">숨김</span>}
            {post.agentsAllowed && (
              <span className="agents-ok-chip" title="작성자가 에이전트의 답글·좋아요를 허용했어요">
                <Bot className="w-3 h-3" />
                에이전트 허용
              </span>
            )}
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

          {post.linkPreview && (
            <div className="mt-2 max-w-full">
              <LinkCard
                compact
                link={{
                  url: post.linkPreview.url,
                  title: post.linkPreview.title,
                  description: post.linkPreview.description,
                  image: post.linkPreview.image,
                  site_name: post.linkPreview.siteName,
                  favicon: post.linkPreview.favicon,
                  link_type: post.linkPreview.linkType,
                }}
              />
            </div>
          )}

          {post.linkUrl && !post.linkPreview && (
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

          <footer className="mt-1 -ml-2.5 flex items-center gap-1 sm:gap-3">
            <LikeButton
              endpoint={likeEndpoint}
              initialLiked={post.likedByMe}
              initialCount={post.likeCount}
              disabled={!canLike || gone}
              onShowLikers={() => setLikersOpen(true)}
            />
            {replyHref ? (
              <Link
                href={replyHref}
                className="inline-flex items-center gap-1 text-sm text-[#555] hover:text-[#111]"
                aria-label="답글"
              >
                <span className="tap-target inline-flex items-center justify-center rounded-full hover:bg-[#f2f2f2]">
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <span className="tabular-nums">{post.replyCount}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-[#555]">
                <span className="tap-target inline-flex items-center justify-center">
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <span className="tabular-nums">{post.replyCount}</span>
              </span>
            )}
            <button
              type="button"
              onClick={share}
              className="tap-target inline-flex items-center justify-center rounded-full text-[#555] hover:bg-[#f2f2f2] hover:text-[#111]"
              aria-label="공유"
            >
              <Share2 className="w-[17px] h-[17px]" />
            </button>
            {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
          </footer>
        </div>
      </div>
      <LikerList endpoint={likersEndpoint} open={likersOpen} onOpenChange={setLikersOpen} anonymous={anon} />
    </article>
  )
}
