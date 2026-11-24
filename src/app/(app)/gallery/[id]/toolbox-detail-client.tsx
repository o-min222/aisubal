'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Copy, ExternalLink, GitBranch, Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { toast } from 'sonner'
import { ToolIcon } from '@/components/tools/tool-icon'
import type { Member, ToolboxEnvironment } from '@/lib/supabase/types'
import type { ToolboxEntryDetails } from '@/lib/data/types'
import type { ToolUsers } from '@/lib/data/tools'
import { TOOLBOX_ENV_LABEL, TOOLBOX_TYPE_LABEL } from '@/lib/toolbox-rules'
import dynamic from 'next/dynamic'
// A67: react-markdown + remark-gfm (~150 KB) load only when a body renders
const MarkdownBody = dynamic(() => import('@/components/markdown-body').then((m) => m.MarkdownBody))
import { RelativeTime } from '@/components/relative-time'
import { ArchiveButton } from '@/components/archive/archive-button'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { UserAvatar } from '@/components/user-avatar'
import { ToolUsersCard } from '@/components/tools/tool-users'
import { ToolQuickActions } from '@/components/tools/tool-quick-actions'
import type { ComposerIdentity } from '@/components/feed/composer'
import type { AiRatingSummary } from '@/lib/data/agora'
import { AiRatingSection } from './ai-rating-section'
import { renderableInstall } from '@/lib/install-catalog'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

interface Props {
  entry: ToolboxEntryDetails
  mentionPosts: { id: string; title: string; created_at: string; url: string }[]
  member: Member
  aiRating: AiRatingSummary
  likedByMe?: boolean
  /** who uploaded / approved it (tool_submissions) */
  provenance?: { by: string; at: string; approvedBy: string | null; approvedAt: string | null } | null
  /** who uses it: an avatar stack here, the full list in a sheet */
  people?: { usage: ToolUsers; stacks: Record<string, Array<{ label: string; iconUrl: string | null }>>; tool: { name: string; url: string }; me: ComposerIdentity }
  launchSlot?: React.ReactNode
  variant?: 'page' | 'pane'
}

const ENVS = Object.keys(TOOLBOX_ENV_LABEL) as ToolboxEnvironment[]

/**
 * A49 · gallery detail, flat and dense: one header row (icon, name, type, small actions), the
 * description, a muted key-value block, people as an avatar stack, CLI as one mono row, and the
 * rest as thin-divided sections with small labels. No nested cards, no big buttons.
 */
export function ToolboxDetailClient({ entry: initial, mentionPosts, member, aiRating, likedByMe = false, provenance, people, launchSlot, variant = 'page' }: Props) {
  const [entry, setEntry] = useState(initial)
  const [rating, setRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [peopleOpen, setPeopleOpen] = useState(false)

  // B-1: only reviewer-verified commands, one tab per client that has its OWN snippet
  const install = useMemo(() => renderableInstall(entry), [entry])
  const [env, setEnv] = useState<ToolboxEnvironment | 'generic'>(install.tabs[0] ?? 'generic')
  const snippet = install.snippets[env] ?? install.snippets[install.tabs[0] ?? 'generic'] ?? ''
  const officialUrl = entry.homepage_url || entry.github_url || entry.canonical_url
  const cli = `aisubal tools install ${entry.slug}`
  const isProduct = entry.type === 'product'
  const usage = people?.usage
  const stack = (usage?.users ?? []).slice(0, 5)
  const date = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString(undefined, { timeZone: 'Asia/Seoul', year: 'numeric', month: 'short', day: 'numeric' }) : tx('미확인'))

  async function copyCli() {
    try {
      await navigator.clipboard.writeText(cli)
      toast.success(tn('복사했어요'))
    } catch {
      toast.error(tn('복사에 실패했습니다.'))
    }
  }

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      toast.success(tn('설치 스니펫을 복사했습니다.'))
    } catch {
      toast.error(tn('복사에 실패했습니다.'))
    }
  }

  async function recordInstall() {
    setBusy(true)
    try {
      const res = await fetch(`/api/toolbox/${entry.id}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: env }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('기록 실패'))
        return
      }
      if (data.entry) setEntry(data.entry)
      toast.success(tn('설치 카운트가 반영되었습니다. CLI: aisubal toolbox install ') + entry.slug)
    } finally {
      setBusy(false)
    }
  }

  async function submitReview() {
    setBusy(true)
    try {
      const res = await fetch(`/api/toolbox/${entry.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, body: reviewBody }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('리뷰 실패'))
        return
      }
      setEntry(data.entry)
      toast.success(tn('리뷰가 저장되었습니다.'))
      setReviewBody('')
    } finally {
      setBusy(false)
    }
  }

  async function voteCompat(environment: ToolboxEnvironment, works: boolean) {
    setBusy(true)
    try {
      const res = await fetch(`/api/toolbox/${entry.id}/compat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment, works }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('투표 실패'))
        return
      }
      setEntry(data.entry)
      toast.success(tn('호환성 투표 반영'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`td td-${variant}`}>
      {variant === 'page' && (
        <Link href={entry.product_id ? '/gallery?category=service' : '/gallery'} className="td-back">
          <ArrowLeft className="w-4 h-4" /> <T>갤러리</T>
        </Link>
      )}

      <header className="td-head">
        <ToolIcon name={entry.name} iconUrl={entry.icon_url} dim="w-10 h-10" />
        <div className="td-title">
          <h1>{entry.name}</h1>
          <span className="td-type"><T>{TOOLBOX_TYPE_LABEL[entry.type]}</T></span>
          {entry.product_id && <span className="launch-chip"><T>런치</T></span>}
        </div>
        <div className="td-actions">
          <ToolQuickActions
            variant="header"
            entryId={entry.id}
            name={entry.name}
            liked={likedByMe}
            likeCount={entry.like_count ?? 0}
            using={usage?.usedByMe ?? false}
            useCount={usage?.count ?? entry.user_count ?? 0}
          />
          <ArchiveButton kind="tool" refId={entry.id} hint={{ title: entry.name, excerpt: entry.one_liner ?? undefined, url: `/gallery/${entry.slug || entry.id}` }} className="td-icon" />
          {entry.github_url && (
            <a href={entry.github_url} target="_blank" rel="noreferrer" className="icon-btn td-icon" aria-label="GitHub" title="GitHub">
              <GitBranch className="w-4 h-4" />
            </a>
          )}
          {entry.homepage_url && (
            <a href={entry.homepage_url} target="_blank" rel="noreferrer" className="icon-btn td-icon" aria-label={tx('홈페이지')} title={tx('홈페이지')}>
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </header>

      {entry.one_liner && <p className="td-lead">{entry.one_liner}</p>}
      {entry.tags.length > 0 && <p className="td-tags">{entry.tags.map((t) => `#${t}`).join(' ')}</p>}
      {entry.description && entry.description.trim() !== (entry.one_liner ?? '').trim() && (
        <div className="td-desc prose-sm">
          <MarkdownBody content={entry.description} />
        </div>
      )}

      <dl className="td-meta">
        {!isProduct && (
          <>
            <dt><T>출처</T></dt>
            <dd className="truncate">{entry.source_repo || entry.canonical_url || tx('미확인')}</dd>
            <dt><T>라이선스</T></dt>
            <dd>{entry.license || tx('미확인')}</dd>
            <dt><T>최근 커밋</T></dt>
            <dd>{date(entry.last_commit_at)}</dd>
          </>
        )}
        {provenance && (
          <>
            <dt><T>올린 사람</T></dt>
            <dd>
              {provenance.by} · <RelativeTime date={provenance.at} />
              {provenance.approvedBy && <span className="td-muted"> · <T s="{name} 승인" vars={{ name: provenance.approvedBy }} /></span>}
            </dd>
          </>
        )}
        <dt><T>평가</T></dt>
        <dd>
          {entry.rating_count > 0 ? (
            <><Star className="td-star" aria-hidden /> {Number(entry.avg_rating).toFixed(1)} <span className="td-muted"><T s="(멤버 {n}명)" vars={{ n: entry.rating_count }} /></span></>
          ) : (
            <span className="td-muted"><T>아직 멤버 평가 없음</T></span>
          )}
          {(entry.ai_rating_count ?? 0) > 0 && <span className="td-muted"> · AI {Number(entry.ai_rating_avg).toFixed(1)}</span>}
          {entry.mention_count > 0 && <span className="td-muted"> · <T s="언급 {mention_count}" vars={{ mention_count: entry.mention_count }} /></span>}
        </dd>
      </dl>

      {usage && (
        <button type="button" className="td-people" onClick={() => setPeopleOpen(true)} aria-label={tx('쓰는 사람 보기')}>
          {stack.length > 0 && (
            <span className="td-stack" aria-hidden>
              {stack.map((u) => <UserAvatar key={u.id} id={u.id} name={u.name} avatarUrl={u.avatarUrl} size="sm" />)}
            </span>
          )}
          <span>
            {usage.count > 0 ? <T s="{count}명이 써요" vars={{ count: usage.count }} /> : <T>아직 쓰는 사람이 없어요</T>}
          </span>
          <span className="td-muted">›</span>
        </button>
      )}

      {!isProduct && (
        <div className="td-cli">
          <code>{cli}</code>
          <button type="button" className="icon-btn td-icon" onClick={() => void copyCli()} aria-label={tx('CLI 명령 복사')} title={tx('복사')}>
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {!isProduct && (
        <section className="td-sec">
          <h2 className="td-label"><T>설치</T></h2>
          {install.tabs.length === 0 ? (
            <p className="td-muted text-[13px]"><T>검증된 설치 명령이 아직 없어요. 공식 설치 안내를 따라 주세요.</T></p>
          ) : (
            <>
              {install.tabs.length > 1 && (
                <div className="td-envs" role="tablist" aria-label={tx('설치 환경')}>
                  {install.tabs.map((e) => (
                    <button key={e} type="button" role="tab" aria-selected={env === e} className={`td-env${env === e ? ' on' : ''}`} onClick={() => setEnv(e)}>
                      {e === 'generic' ? <T>공통</T> : <T>{TOOLBOX_ENV_LABEL[e]}</T>}
                    </button>
                  ))}
                </div>
              )}
              <div className="td-code">
                <pre>{snippet}</pre>
                <button type="button" className="icon-btn td-icon" onClick={() => void copySnippet()} aria-label={tx('설치 스니펫 복사')} title={tx('복사')}>
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          )}
          <p className="td-links">
            <a href={officialUrl} target="_blank" rel="noopener noreferrer" className="text-link"><T>공식 설치 안내</T> ↗</a>
            <span aria-hidden>·</span>
            <button type="button" className="text-link" disabled={busy} onClick={() => void recordInstall()}>
              <Check className="w-3.5 h-3.5 inline -mt-0.5" /> <T>설치함으로 표시</T>
            </button>
            {entry.install_count > 0 && <span className="td-muted"><T s="설치 {install_count}" vars={{ install_count: entry.install_count }} /></span>}
          </p>
        </section>
      )}

      {launchSlot}

      {!isProduct && (
        <section className="td-sec">
          <h2 className="td-label">Works with</h2>
          <ul className="td-rows">
            {ENVS.map((e) => {
              const c = entry.compat[e]
              return (
                <li key={e} className="td-row">
                  <span className="flex-1 min-w-0 truncate"><T>{TOOLBOX_ENV_LABEL[e]}</T></span>
                  <button type="button" className="qa-btn" disabled={busy} onClick={() => void voteCompat(e, true)} aria-label={tx('작동함')}>
                    <ThumbsUp className="qa-ic" aria-hidden /> <span className="tabular-nums">{c.yes}</span>
                  </button>
                  <button type="button" className="qa-btn" disabled={busy} onClick={() => void voteCompat(e, false)} aria-label={tx('안 됨')}>
                    <ThumbsDown className="qa-ic" aria-hidden /> <span className="tabular-nums">{c.no}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="td-sec">
        <h2 className="td-label"><T s="언급된 게시물 ({length})" vars={{ length: mentionPosts.length }} /></h2>
        {mentionPosts.length === 0 ? (
          <p className="td-muted text-[13px]"><T>아직 연결된 게시물이 없습니다.</T></p>
        ) : (
          <ul className="td-rows">
            {mentionPosts.map((p) => (
              <li key={p.id} className="td-row">
                <Link href={`/posts/${p.id}`} className="text-link flex-1 min-w-0 truncate">{p.title}</Link>
                <span className="td-muted text-xs"><RelativeTime date={p.created_at} /></span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AiRatingSection summary={aiRating} toolName={entry.name} flat />

      <section className="td-sec">
        <h2 className="td-label"><T>커뮤니티 리뷰</T></h2>
        {entry.reviews.length === 0 ? (
          <p className="td-muted text-[13px]"><T>첫 리뷰를 남겨 주세요.</T></p>
        ) : (
          <ul className="td-rows">
            {entry.reviews.map((r) => (
              <li key={r.id} className="td-review">
                <span className="td-muted text-xs inline-flex items-center gap-1">
                  <Star className="td-star" aria-hidden /> {r.rating} · <RelativeTime date={r.created_at} />
                </span>
                {r.body && <p className="text-[13.5px] text-n-444">{r.body}</p>}
              </li>
            ))}
          </ul>
        )}
        <div className="td-review-form">
          <span className="inline-flex" role="radiogroup" aria-label={tx('별점')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={n === rating} onClick={() => setRating(n)} className="td-starbtn" aria-label={tx('{n}점', { n })}>
                <Star className={n <= rating ? 'td-star' : 'td-star off'} />
              </button>
            ))}
          </span>
          <input value={reviewBody} onChange={(e) => setReviewBody(e.target.value)} placeholder={tx('짧은 사용 후기 (선택)')} aria-label={tx('짧은 사용 후기 (선택)')} maxLength={500} />
          <button type="button" className="text-link td-save" disabled={busy} onClick={() => void submitReview()}>
            <T>리뷰 저장</T>
          </button>
        </div>
      </section>

      {!isProduct && <p className="td-disclaimer"><T>커뮤니티 디렉터리 항목이며 공식 보증이 아닙니다. 실행 전 레포를 검토하세요.</T></p>}
      <p className="td-disclaimer td-who"><T s="로그인 사용자: {name}" vars={{ name: member.display_name }} /></p>

      {people && (
        <AdaptiveSheet open={peopleOpen} onOpenChange={setPeopleOpen} title={tx('쓰는 사람')}>
          <ToolUsersCard entryId={entry.id} usage={people.usage} stacks={people.stacks} tool={people.tool} me={people.me} />
        </AdaptiveSheet>
      )}
    </div>
  )
}
