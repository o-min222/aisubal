'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  ShieldAlert,
  Star,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import type { Member, ToolboxEnvironment } from '@/lib/supabase/types'
import type { ToolboxEntryDetails } from '@/lib/data/types'
import {
  TOOLBOX_ENV_LABEL,
  TOOLBOX_TYPE_LABEL,
} from '@/lib/toolbox-rules'
import { MarkdownBody } from '@/components/markdown-body'
import { RelativeTime } from '@/components/relative-time'
import { ArchiveButton } from '@/components/archive/archive-button'
import { toast } from 'sonner'
import type { AiRatingSummary } from '@/lib/data/agora'
import { AiRatingSection } from './ai-rating-section'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

interface Props {
  entry: ToolboxEntryDetails
  mentionPosts: { id: string; title: string; created_at: string; url: string }[]
  member: Member
  aiRating: AiRatingSummary
  /** Server-rendered 'N명이 사용 중' card and, for launches, the 프로덕트 런치 section. */
  usersSlot?: React.ReactNode
  launchSlot?: React.ReactNode
  provenanceSlot?: React.ReactNode
  variant?: 'page' | 'pane'
}

const ENVS = Object.keys(TOOLBOX_ENV_LABEL) as ToolboxEnvironment[]

export function ToolboxDetailClient({ entry: initial, mentionPosts, member, aiRating, usersSlot, launchSlot, provenanceSlot, variant = 'page' }: Props) {
  const [entry, setEntry] = useState(initial)
  const [env, setEnv] = useState<ToolboxEnvironment | 'generic'>('cursor')
  const [rating, setRating] = useState(5)
  const [reviewBody, setReviewBody] = useState('')
  const [busy, setBusy] = useState(false)

  const snippet = useMemo(() => {
    return (
      entry.install_snippets[env] ||
      entry.install_snippets.generic ||
      entry.install_snippets.cursor ||
      `# ${entry.name}\n${entry.canonical_url}`
    )
  }, [entry, env])

  const deeplink =
    entry.type === 'mcp_server'
      ? `cursor://anysphere.cursor-deeplink/mcp/install?name=${encodeURIComponent(entry.name)}`
      : null

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
    <div className={variant === 'page' ? 'max-w-3xl mx-auto space-y-4' : 'space-y-3'}>
      {variant === 'page' && (
        <Link
          href={entry.product_id ? '/tools?category=launch' : '/tools'}
          className="inline-flex items-center gap-2 text-sm text-n-666 hover:text-n-111"
        >
          <ArrowLeft className="w-4 h-4" />
          <T>툴 목록</T>
        </Link>
      )}

      <article className="card p-6">
        <div className="flex gap-4 items-start">
          <div className="product-icon w-16 h-16 text-xl flex-shrink-0">
            {entry.name.charAt(0)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="badge badge-mcp"><T>{TOOLBOX_TYPE_LABEL[entry.type]}</T></span>
              {entry.product_id && <span className="launch-chip"><T>런치</T></span>}
              {entry.tags.map((t) => (
                <span key={t} className="badge badge-note">
                  #{t}
                </span>
              ))}
            </div>
            <h1 className="text-2xl font-bold text-n-111">{entry.name}</h1>
            <p className="text-n-666 mt-1">{entry.one_liner}</p>
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-n-666">
              <span className="inline-flex items-center gap-1">
                <Star className="w-4 h-4 fill-[#f5a623] text-[#f5a623]" />
                {entry.avg_rating.toFixed(1)} ({entry.rating_count})
              </span>
              {(entry.ai_rating_count ?? 0) > 0 && <span>AI {Number(entry.ai_rating_avg).toFixed(1)}</span>}
              {(entry.user_count ?? 0) > 0 && <span><T s="{user_count}명이 써요" vars={{ user_count: entry.user_count }} /></span>}
              {entry.product_id ? <span><T s="업보트 {v}" vars={{ v: entry.upvote_count ?? 0 }} /></span> : <span><T s="설치 {install_count}" vars={{ install_count: entry.install_count }} /></span>}
              <span><T s="언급 {mention_count}" vars={{ mention_count: entry.mention_count }} /></span>
            </div>
            <div className="flex flex-wrap gap-3 mt-3 text-sm items-center">
              {entry.github_url && (
                <a
                  href={entry.github_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-c-06c inline-flex items-center gap-1"
                >
                  GitHub <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              {entry.homepage_url && (
                <a
                  href={entry.homepage_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-c-06c inline-flex items-center gap-1"
                >
                  <T>홈페이지</T> <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <ArchiveButton kind="tool" refId={entry.id} variant="pill" hint={{ title: entry.name, excerpt: entry.one_liner ?? undefined, url: `/tools/${entry.id}` }} />
            </div>
          </div>
        </div>

        <div className="mt-6 prose-sm">
          <MarkdownBody content={entry.description} />
        </div>
      </article>

      {provenanceSlot}
      {usersSlot}
      {launchSlot}

      {entry.type !== 'product' && (<>
      <section className="card p-4 border-amber-200 bg-c-fff4e5/40">
        <h2 className="font-semibold text-n-111 flex items-center gap-2 mb-2">
          <ShieldAlert className="w-4 h-4 text-c-8a4b00" />
          <T>설치 전 보안 확인</T>
        </h2>
        <ul className="text-sm text-n-555 space-y-1">
          <li><T s="소스: {v}" vars={{ v: entry.source_repo || entry.canonical_url }} /></li>
          <li><T s="라이선스: {v}" vars={{ v: entry.license || tx('미확인') }} /></li>
          <li><T s="최근 커밋: {v}" vars={{ v: entry.last_commit_at
              ? new Date(entry.last_commit_at).toLocaleDateString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                })
              : tx('미확인') }} /></li>
          <li className="text-n-888">
            <T>커뮤니티 디렉터리 항목이며 공식 보증이 아닙니다. 실행 전 레포를 검토하세요.</T>
          </li>
        </ul>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold text-n-111 mb-3 flex items-center gap-2">
          <Download className="w-4 h-4" />
          <T>바로 적용</T>
        </h2>
        <div className="tab-filters mb-3 flex-wrap">
          {ENVS.map((e) => (
            <button
              key={e}
              type="button"
              className={`tab-filter ${env === e ? 'active' : ''}`}
              onClick={() => setEnv(e)}
            >
              <T>{TOOLBOX_ENV_LABEL[e]}</T>
            </button>
          ))}
          <button
            type="button"
            className={`tab-filter ${env === 'generic' ? 'active' : ''}`}
            onClick={() => setEnv('generic')}
          >
            Generic
          </button>
        </div>
        <pre className="bg-n-111 text-n-f5f5f5 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">
          {snippet}
        </pre>
        <div className="flex flex-wrap gap-2 mt-3">
          <button type="button" className="btn btn-secondary btn-sm" onClick={copySnippet}>
            <Copy className="w-4 h-4" />
            <T>복사</T>
          </button>
          {deeplink && (
            <a href={deeplink} className="btn btn-primary btn-sm">
              <T>Cursor에 설치</T>
            </a>
          )}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void recordInstall()}
          >
            <Check className="w-4 h-4" />
            <T>설치함으로 표시</T>
          </button>
        </div>
        <p className="text-xs text-n-888 mt-3">
          CLI: <code className="font-mono">aisubal tools install {entry.slug}</code>
          {' · '}
          로그인 사용자: {member.display_name}
        </p>
      </section>

      <section className="card p-6">
        <h2 className="font-semibold text-n-111 mb-3">Works with</h2>
        <div className="space-y-2">
          {ENVS.map((e) => {
            const c = entry.compat[e]
            return (
              <div
                key={e}
                className="flex items-center justify-between gap-3 text-sm border-b border-n-f0f0f0 py-2"
              >
                <span className="text-n-333"><T>{TOOLBOX_ENV_LABEL[e]}</T></span>
                <span className="text-n-888">
                  👍 {c.yes} · 👎 {c.no}
                </span>
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void voteCompat(e, true)}
                    aria-label={tx('작동함')}
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={busy}
                    onClick={() => void voteCompat(e, false)}
                    aria-label={tx('안 됨')}
                  >
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </section>
      </>)}

      <section className="card p-6">
        <h2 className="font-semibold text-n-111 mb-3"><T s="언급된 게시물 ({length})" vars={{ length: mentionPosts.length }} /></h2>
        {mentionPosts.length === 0 ? (
          <p className="text-sm text-n-888"><T>아직 연결된 게시물이 없습니다.</T></p>
        ) : (
          <ul className="space-y-2">
            {mentionPosts.map((p) => (
              <li key={p.id}>
                <Link href={`/posts/${p.id}`} className="text-c-06c text-sm hover:underline">
                  {p.title}
                </Link>
                <span className="text-xs text-n-888 ml-2">
                  <RelativeTime date={p.created_at} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AiRatingSection summary={aiRating} toolName={entry.name} />

      <section className="card p-6">
        <h2 className="font-semibold text-n-111 mb-3"><T>커뮤니티 리뷰</T></h2>
        <div className="space-y-3 mb-6">
          {entry.reviews.length === 0 && (
            <p className="text-sm text-n-888"><T>첫 리뷰를 남겨 주세요.</T></p>
          )}
          {entry.reviews.map((r) => (
            <div key={r.id} className="border-b border-n-f0f0f0 pb-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 text-[#f5a623]">
                  <Star className="w-3.5 h-3.5 fill-current" />
                  {r.rating}
                </span>
                <RelativeTime date={r.created_at} />
              </div>
              {r.body && <p className="text-sm text-n-444 mt-1">{r.body}</p>}
            </div>
          ))}
        </div>
        <div className="space-y-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                className="p-1"
                aria-label={tx('{n}점', { n })}
              >
                <Star
                  className={`w-5 h-5 ${
                    n <= rating ? 'fill-[#f5a623] text-[#f5a623]' : 'text-n-ddd'
                  }`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder={tx('짧은 사용 후기 (선택)')}
            className="w-full min-h-[80px] rounded-lg border border-n-e5e5e5 p-3 text-sm"
          />
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void submitReview()}
          >
            <T>리뷰 저장</T>
          </button>
        </div>
      </section>
    </div>
  )
}
