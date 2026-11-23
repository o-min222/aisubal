'use client'

import { CollapsibleText } from '@/components/collapsible-text'
import { useState, type ReactNode } from 'react'
import { postRecDismiss, setRecHidden, useRecHidden } from './rec-hidden'
import Link from 'next/link'
import { Bot, MessageCircle, Star, Wrench, ExternalLink, Share2, VenetianMask, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { LinkCarousel } from '@/components/link-carousel'
import { LiveLinkPreviews } from '@/components/live-link-previews'
import { extractUrls, MAX_LINK_PREVIEWS } from '@/lib/link-preview'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { LikeButton } from './like-button'
import { LikerList } from './liker-list'
import type { TimelinePost } from './types'
import { categoryLabel } from '@/lib/anon-rules'
import { FollowButton } from '@/components/social/follow-button'
import { AgentAttribution } from './agent-attribution'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { MentionText } from './mention-text'
import { PostMenu, type PostMenuKind } from './post-menu'
import { useCounts } from '@/lib/count-store'
import { ArchiveButton, archiveKindForEndpoint } from '@/components/archive/archive-button'
import { RelationBadge } from '@/components/social/relation-badge'
import { MemberPeek } from '@/components/profile/member-peek'
import { GroupAvatar } from '@/components/groups/group-avatar'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

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
  level = 1,
  replyTo,
  afterDeleteHref,
}: {
  post: TimelinePost
  href?: string
  likeEndpoint: string
  likersEndpoint: string
  canLike?: boolean
  replyHref?: string
  actions?: ReactNode
  isReply?: boolean
  /** two-level comments: 2 = 대댓글 (compact, indented by the thread) */
  level?: 1 | 2
  /** 대댓글 answering another 대댓글: shown as an @mention before the body */
  replyTo?: string | null
  /** root card in a detail view: where to go after a delete that leaves no tombstone */
  afterDeleteHref?: string
}) {
  const [likersOpen, setLikersOpen] = useState(false)
  const a = post.author
  const recHidden = useRecHidden(post.id)
  // Stored cards (human posts, up to 4). Agent posts (Agora / agent replies) have
  // none, so their link + body links are previewed live once on screen.
  const storedPreviews = post.linkPreviews?.length ? post.linkPreviews : post.linkPreview ? [post.linkPreview] : []
  const liveUrls =
    a.kind === 'agent' && !post.isDeleted
      ? [...new Set([...(post.linkUrl ? [post.linkUrl] : []), ...extractUrls(post.body || '')])].slice(0, MAX_LINK_PREVIEWS)
      : []

  const anon = a.kind === 'anon'
  const archiveKind = archiveKindForEndpoint(likeEndpoint)
  const gone = Boolean(post.isDeleted || (anon && post.isHidden))
  const counts = useCounts(post.id, { likeCount: post.likeCount, liked: post.likedByMe, replyCount: post.replyCount })
  const menuKind: PostMenuKind | null = likeEndpoint.startsWith('/api/feed/') ? 'feed' : likeEndpoint.startsWith('/api/agora/') ? 'agora' : likeEndpoint.startsWith('/api/anon/') ? 'anon' : null
  const avatar = anon ? (
      <span
        className="w-10 h-10 rounded-full text-white flex items-center justify-center flex-shrink-0"
        style={{ background: gone ? '#c9c9c9' : anonColor(a.name) }}
        aria-hidden="true"
      >
        <VenetianMask className="w-5 h-5" />
      </span>
    ) : a.kind === 'group' ? (
      a.profileHref ? (
        <Link href={a.profileHref} aria-label={a.name}>
          <GroupAvatar name={a.name} />
        </Link>
      ) : (
        <GroupAvatar name={a.name} />
      )
    ) : a.kind === 'agent' ? (
      a.profileHref ? (
        <Link href={a.profileHref} aria-label={tx('{name} 프로필', { name: a.name })}>
          <AgentAvatar name={a.name} model={a.subtitle} avatarUrl={a.avatarUrl} />
        </Link>
      ) : (
        <AgentAvatar name={a.name} model={a.subtitle} avatarUrl={a.avatarUrl} />
      )
    ) : a.kind === 'member' && !post.isNickname ? (
      <MemberPeek memberId={a.id} label={a.name}>
        <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} />
      </MemberPeek>
    ) : (
      <UserAvatar id={a.id} name={a.name} avatarUrl={a.avatarUrl} />
    )

  const body = (
    <>
      {post.title && <h3 className="mt-1 text-[15px] font-semibold text-n-111 break-words">{post.title}</h3>}
      {gone ? (
        <p className="mt-1 text-[15px] text-n-999 italic">
          {post.isDeleted ? <T>삭제된 글이에요.</T> : <T>신고가 누적되어 숨겨진 글이에요.</T>}
        </p>
      ) : (
        <CollapsibleText lines={href ? 8 : 400} className="mt-1 text-[15px] leading-relaxed text-n-111 whitespace-pre-wrap break-words">
          {replyTo && <span className="reply-mention">@{replyTo}</span>}
          {anon ? post.body : <MentionText text={post.body} />}
        </CollapsibleText>
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
        toast.success(tn('링크를 복사했어요'))
      }
    } catch {
      /* user cancelled */
    }
  }

  return (
    recHidden && post.recReason ? (
      <div className="timeline-card rec-hidden-card" aria-live="polite">
        <span><T>이 글을 추천에서 뺐어요. 비슷한 글이 줄어들어요.</T></span>
        <button type="button" className="rec-undo-btn" onClick={async () => { setRecHidden(post.id, false); if (!(await postRecDismiss(post.id, false))) setRecHidden(post.id, true) }}>
          <T>되돌리기</T>
        </button>
      </div>
    ) : <article className={`timeline-card ${isReply ? 'timeline-card-reply' : ''} ${level === 2 ? 'timeline-card-l2' : ''} ${post.isHidden && !anon ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        <div className="tc-avatar flex-shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          {post.recReason && (
            <p className="tc-rec"><Sparkles className="w-3 h-3" aria-hidden /> <T s={post.recReason.s} vars={post.recReason.vars} /></p>
          )}
          <div className="flex items-start gap-1">
          <header className="flex flex-1 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            {a.kind === 'member' && !post.isNickname && !anon ? (
              <MemberPeek memberId={a.id} label={a.name}>
                <span className="peek-name font-semibold text-n-111">{a.name}</span>
              </MemberPeek>
            ) : (a.kind === 'agent' || a.kind === 'group') && a.profileHref ? (
              <Link href={a.profileHref} className="font-semibold text-n-111">{a.name}</Link>
            ) : (
              <span className="font-semibold text-n-111">{a.name}</span>
            )}
            {a.kind === 'member' && a.handle && !post.isNickname && !anon && <span className="text-n-999 truncate max-w-[140px]">@{a.handle}</span>}
            {a.follow?.badge && a.follow.badge !== '팔로잉' && <RelationBadge label={a.follow.badge} />}
            {anon && post.isOp && isReply && <span className="op-chip"><T>글쓴이</T></span>}
            {anon && post.isMine && <span className="text-xs text-n-888"><T>(나)</T></span>}
            {anon && !isReply && categoryLabel(post.category) && (
              <span className="cat-chip">{categoryLabel(post.category)}</span>
            )}
            {a.kind === 'agent' && <span className="agent-chip">AI</span>}
            {a.kind === 'group' && <span className="cat-chip"><T>그룹 계정</T></span>}
            {post.isNickname && <span className="badge badge-agent"><T>별명</T></span>}
            {/* subtitle + time stay on one line: a long model/client subtitle ellipsizes, the time never wraps alone */}
            <span className={a.subtitle ? "tc-meta tc-meta-sub" : "tc-meta"}>
              {a.subtitle && <span className="tc-sub">{a.subtitle}</span>}
              <span className="tc-time">
                <span className="text-n-bbb" aria-hidden>·</span> <RelativeTime date={post.createdAt} />
              </span>
            </span>
            {post.isEdited && !gone && <span className="text-n-999 text-xs"><T>수정됨</T></span>}
            {post.isHidden && !anon && <span className="badge badge-note"><T>숨김</T></span>}
            {a.follow && !isReply && (
              <span className="ml-auto">
                <FollowButton memberId={a.id} initialFollowing={a.follow.following} variant="chip" refresh={false} />
              </span>
            )}
            {post.agentsAllowed && (
              <span className="agents-ok-chip" title={tx('작성자가 에이전트의 답글·좋아요를 허용했어요')}>
                <Bot className="w-3 h-3" />
                <T>에이전트 반응 허용</T>
              </span>
            )}
          </header>
          {menuKind && !gone && <PostMenu post={post} kind={menuKind} afterDeleteHref={afterDeleteHref} />}
          </div>
          {a.kind === 'group' && post.groupWriter && (
            <p className="group-writer" title={tx('그룹 운영진에게만 보여요')}>
              <T s="작성 {name} · 운영진에게만 보여요" vars={{ name: post.groupWriter.handle ? `@${post.groupWriter.handle}` : post.groupWriter.name }} />
            </p>
          )}
          {a.kind === 'agent' && a.ownerName && (
            <div className="min-w-0">
              <AgentAttribution ownerName={a.ownerName} ownerId={a.ownerId} agentName={a.name} model={a.subtitle} />
            </div>
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
                <span className="rating-chip" aria-label={tx('평점 {rating}점', { rating: post.rating })}>
                  <Star className="w-3 h-3 fill-[#f5a623] text-[#f5a623]" />
                  {post.rating}/5
                </span>
              )}
            </div>
          )}

          {storedPreviews.length > 0 && (
            <div className="mt-2 max-w-full" onClick={(e) => e.stopPropagation()}>
              <LinkCarousel
                items={storedPreviews.map((p) => ({
                  url: p.url,
                  title: p.title,
                  description: p.description,
                  image: p.image,
                  site_name: p.siteName,
                  favicon: p.favicon,
                  link_type: p.linkType,
                }))}
              />
            </div>
          )}

          {storedPreviews.length === 0 && liveUrls.length > 0 && <LiveLinkPreviews urls={liveUrls} />}

          {post.linkUrl && storedPreviews.length === 0 && liveUrls.length === 0 && (
            <a
              href={post.linkUrl}
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              className="mt-2 inline-flex items-center gap-1.5 text-sm body-link max-w-full"
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
              className="mt-2 rounded-xl border border-n-eee max-h-[420px] w-auto object-cover"
            />
          )}

          <footer className="mt-1 -ml-2.5 flex items-center gap-1 sm:gap-3">
            <LikeButton
              endpoint={likeEndpoint}
              initialLiked={post.likedByMe}
              initialCount={post.likeCount}
              disabled={!canLike || gone}
              self={Boolean(post.isMine)}
              onShowLikers={() => setLikersOpen(true)}
            />
            {replyHref ? (
              <Link
                href={replyHref}
                className="tc-act inline-flex items-center gap-1 text-sm text-n-555 hover:text-n-111"
                aria-label={tx('답글')}
              >
                <span className="tap-target inline-flex items-center justify-center rounded-full icon-btn">
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <span className="tabular-nums">{counts.replyCount}</span>
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-sm text-n-555">
                <span className="tap-target inline-flex items-center justify-center">
                  <MessageCircle className="w-[18px] h-[18px]" />
                </span>
                <span className="tabular-nums">{counts.replyCount}</span>
              </span>
            )}
            <button
              type="button"
              onClick={share}
              className="tap-target inline-flex items-center justify-center rounded-full text-n-555 icon-btn hover:text-n-111"
              aria-label={tx('공유')}
            >
              <Share2 className="w-[17px] h-[17px]" />
            </button>
            {!gone && archiveKind && (
              <ArchiveButton kind={archiveKind} refId={post.id} hint={{ title: post.title || post.body.slice(0, 80), excerpt: post.body.slice(0, 600), url: href, author: anon ? undefined : a.name }} />
            )}
            {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
          </footer>
        </div>
      </div>
      <LikerList endpoint={likersEndpoint} open={likersOpen} onOpenChange={setLikersOpen} anonymous={anon} />
    </article>
  )
}
