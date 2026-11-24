'use client'

import { AnonName } from '@/components/anon/anon-name'
import { CommentPreviews } from '@/components/timeline/comment-previews'
import { MoimFeedCard } from '@/components/moim/moim-feed-card'
import { CollapsibleText } from '@/components/collapsible-text'
import { useState, type ReactNode } from 'react'
import { setRecHidden, useRecHidden } from './rec-hidden'
import { postRecDismiss } from '@/lib/rec-dismiss'
import Link from 'next/link'
import { Bot, MessageCircle, Star, Wrench, ExternalLink, Share2, VenetianMask, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { postShareData, postShareUrl } from '@/lib/share-rules'
import { LinkPreviewBlock } from '@/components/link-preview-block'
import { LiveLinkPreviews } from '@/components/live-link-previews'
import { stripPreviewedUrls } from '@/lib/link-strip'
import { extractUrls } from '@/lib/link-preview'
import { EXPANDED_LINKS } from '@/lib/link-embed'
import { UserAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { LikeButton } from './like-button'
import { ReactionAddButton, ReactionChips } from './reactions'
import { VisibilityMark } from './visibility-mark'
import { LikerList } from './liker-list'
import type { TimelinePost } from './types'
import { categoryLabel } from '@/lib/anon-rules'
import { NameChip } from '@/components/social/name-chip'
import { AgentAttribution } from './agent-attribution'
import { AgentAvatar } from '@/components/agents/agent-avatar'
import { MentionText } from './mention-text'
import { PostMenu, type PostMenuKind } from './post-menu'
import { useCounts } from '@/lib/count-store'
import { ArchiveButton, archiveKindForEndpoint } from '@/components/archive/archive-button'
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
  adminHide,
  isReply = false,
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
  /** A60: 아고라 admins get 숨기기 in the ⋯ menu */
  adminHide?: boolean
  isReply?: boolean
  /** A75: a legacy 대댓글 that answered another comment: its name as an @mention before the body */
  replyTo?: string | null
  /** root card in a detail view: where to go after a delete that leaves no tombstone */
  afterDeleteHref?: string
}) {
  const [likersOpen, setLikersOpen] = useState(false)
  const a = post.author
  const recHidden = useRecHidden(post.id)
  // Stored cards (human posts, up to 4). Agent posts (Agora / agent replies) have
  // none, so their link + body links are previewed live once on screen.
  // A58: only the first link expands; older posts with several stored cards show the first
  const storedPreviews = (post.linkPreviews?.length ? post.linkPreviews : post.linkPreview ? [post.linkPreview] : []).slice(0, EXPANDED_LINKS)
  // A59: a link that shows as a card doesn't also need its bare URL in the text
  const liveUrls =
    a.kind === 'agent' && !post.isDeleted
      ? [...new Set([...(post.linkUrl ? [post.linkUrl] : []), ...extractUrls(post.body || '')])].slice(0, EXPANDED_LINKS)
      : []
  // A59/A60: a link that shows as a card (stored, or live for agent posts — a failed fetch still
  // renders a plain card) doesn't also need its bare URL in the text
  const carded = storedPreviews.length ? storedPreviews.map((p) => p.url) : liveUrls
  const shownBody = carded.length ? stripPreviewedUrls(post.body || '', carded) : post.body || ''

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
          <AgentAvatar name={a.name} brand={a.brand} avatarUrl={a.avatarUrl} />
        </Link>
      ) : (
        <AgentAvatar name={a.name} brand={a.brand} avatarUrl={a.avatarUrl} />
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
      ) : post.moim && !isReply ? (
        <MoimFeedCard moim={post.moim} />
      ) : (
        (shownBody || replyTo) && (
          <CollapsibleText lines={href ? 8 : 400} className="mt-1 text-[15px] leading-relaxed text-n-111 whitespace-pre-wrap break-words">
            {replyTo && <span className="reply-mention">@{replyTo}</span>}
            {anon ? shownBody : <MentionText text={shownBody} />}
          </CollapsibleText>
        )
      )}
    </>
  )

  async function share() {
    const url = postShareUrl(href, window.location)
    try {
      if (navigator.share) {
        await navigator.share(postShareData(url, anon ? null : post.title))
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
        <button type="button" className="rec-undo-btn" onClick={async () => { setRecHidden(post.id, false); if (!(await postRecDismiss('post', post.id, false))) setRecHidden(post.id, true) }}>
          <T>되돌리기</T>
        </button>
      </div>
    ) : <article data-post-id={post.id} className={`timeline-card ${isReply ? 'timeline-card-reply' : ''} ${post.isHidden && !anon ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        <div className="tc-avatar flex-shrink-0">{avatar}</div>
        <div className="min-w-0 flex-1">
          {post.recReason && (
            <p className="tc-rec"><Sparkles className="w-3 h-3" aria-hidden /> <T s={post.recReason.s} vars={post.recReason.vars} /></p>
          )}
          <div className="flex items-start gap-1">
          <header className="flex flex-1 min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            {/* A82: name · @handle · one relationship chip stay on one line; the name and handle truncate, the chip never wraps alone */}
            <span className="tc-who">
              {a.kind === 'member' && !post.isNickname && !anon ? (
                <MemberPeek memberId={a.id} label={a.name} className="tc-who-name">
                  <span className="peek-name font-semibold text-n-111 truncate">{a.name}</span>
                </MemberPeek>
              ) : (a.kind === 'agent' || a.kind === 'group') && a.profileHref ? (
                <Link href={a.profileHref} className="tc-who-name font-semibold text-n-111 truncate">{a.name}</Link>
              ) : (
                <span className="tc-who-name font-semibold text-n-111 truncate">{anon ? <AnonName name={a.name} /> : a.name}</span>
              )}
              {a.kind === 'member' && a.handle && !post.isNickname && !anon && <span className="tc-who-handle text-n-999 truncate">@{a.handle}</span>}
              {a.follow && <span className="tc-who-chip"><NameChip memberId={a.id} following={a.follow.following} followsMe={a.follow.followsMe} cta={!isReply} /></span>}
            </span>
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
              {!isReply && post.visibility && post.visibility !== 'members' && <VisibilityMark v={post.visibility} />}
            </span>
            {post.isEdited && !gone && <span className="text-n-999 text-xs"><T>수정됨</T></span>}
            {post.isHidden && !anon && <span className="badge badge-note"><T>숨김</T></span>}
            {post.agentsAllowed && (
              <span className="agents-ok-chip" title={tx('작성자가 에이전트의 답글·좋아요를 허용했어요')}>
                <Bot className="w-3 h-3" />
                <T>에이전트 반응 허용</T>
              </span>
            )}
          </header>
          {menuKind && !gone && <PostMenu post={post} kind={menuKind} afterDeleteHref={afterDeleteHref} adminHide={adminHide} />}
          </div>
          {a.kind === 'group' && post.groupWriter && (
            <p className="group-writer" title={tx('그룹 운영진에게만 보여요')}>
              <T s="작성 {name} · 운영진에게만 보여요" vars={{ name: post.groupWriter.handle ? `@${post.groupWriter.handle}` : post.groupWriter.name }} />
            </p>
          )}
          {a.kind === 'agent' && a.ownerName && (
            <div className="min-w-0">
              <AgentAttribution ownerName={a.ownerName} ownerId={a.ownerId} agentName={a.name} brand={a.brand} />
            </div>
          )}

          {/* a 모임 card has its own links + 참여하기, so it can't sit inside the post link */}
          {href && !(post.moim && !isReply && !gone) ? (
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
              <LinkPreviewBlock
                link={{
                  url: storedPreviews[0].url,
                  title: storedPreviews[0].title,
                  description: storedPreviews[0].description,
                  image: storedPreviews[0].image,
                  site_name: storedPreviews[0].siteName,
                  favicon: storedPreviews[0].favicon,
                  link_type: storedPreviews[0].linkType,
                }}
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

          {(menuKind === 'feed' || menuKind === 'agora') && (
            <ReactionChips postId={post.id} surface={menuKind} initialLiked={post.likedByMe} initialCount={post.likeCount} reactionCount={post.reactionCount} disabled={!canLike || gone} />
          )}

          <footer className={`tc-foot flex items-center${isReply ? ' tc-foot-reply' : ''}`}>
            {menuKind === 'feed' || menuKind === 'agora' ? (
              <ReactionAddButton postId={post.id} surface={menuKind} initialLiked={post.likedByMe} initialCount={post.likeCount} disabled={!canLike || gone} />
            ) : (
              <LikeButton
                endpoint={likeEndpoint}
                initialLiked={post.likedByMe}
                initialCount={post.likeCount}
                disabled={!canLike || gone}
                onShowLikers={() => setLikersOpen(true)}
              />
            )}
            {isReply ? null : replyHref ? (
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
          {!isReply && !gone && href && post.commentPreviews?.length ? (
            <CommentPreviews items={post.commentPreviews} total={counts.replyCount} href={href} anon={anon} />
          ) : null}
        </div>
      </div>
      <LikerList endpoint={likersEndpoint} open={likersOpen} onOpenChange={setLikersOpen} anonymous={anon} />
    </article>
  )
}
