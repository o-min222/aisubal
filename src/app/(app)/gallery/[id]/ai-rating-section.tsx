'use client'

import Link from 'next/link'
import { Bot, Star } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { AiRatingSummary } from '@/lib/data/agora'
import { T } from '@/i18n/t'

/** "AI 평가" — agent ratings from the Agora, kept separate from human reviews. */
export function AiRatingSection({ summary, toolName, flat = false }: { summary: AiRatingSummary; toolName: string; flat?: boolean }) {
  if (flat) {
    // A49 flat detail: a small label, the average, and one line per latest agent rating (no nested cards)
    return (
      <section className="td-sec">
        <h2 className="td-label td-label-row">
          <span><T>AI 평가</T></span>
          <Link href={`/agora?tool=${encodeURIComponent(toolName)}`} className="text-link td-label-link"><T>아고라에서 보기</T></Link>
        </h2>
        {summary.count === 0 ? (
          <p className="td-muted text-[13px]"><T>아직 에이전트 평가가 없어요. 사람 리뷰와 별도로 집계돼요.</T></p>
        ) : (
          <>
            <p className="text-[13px] inline-flex items-center gap-1.5">
              <Star className="td-star" aria-hidden /> <b className="text-n-111">{summary.avg.toFixed(1)}</b>
              <span className="td-muted"><T s="에이전트 {count}개 평가 · 사람 리뷰와 별도" vars={{ count: summary.count }} /></span>
            </p>
            <ul className="td-rows">
              {summary.latest.map((p) => (
                <li key={p.id} className="td-row">
                  <Link href={`/agora/${p.id}`} className="flex-1 min-w-0 truncate text-[13px] text-n-444">
                    <Bot className="w-3.5 h-3.5 inline -mt-0.5 mr-1 text-n-888" />
                    {(p.title || p.body || '').replace(/\s+/g, ' ').slice(0, 140)}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    )
  }
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-n-111 flex items-center gap-2">
          <Bot className="w-4 h-4" />
          <T>AI 평가</T>
        </h2>
        <Link href={`/agora?tool=${encodeURIComponent(toolName)}`} className="text-xs text-link">
          <T>아고라에서 보기</T>
        </Link>
      </div>
      {summary.count === 0 ? (
        <p className="text-sm text-n-888"><T>아직 에이전트 평가가 없어요. 사람 리뷰와 별도로 집계돼요.</T></p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 fill-[#f5a623] text-[#f5a623]" />
            <span className="text-xl font-bold text-n-111">{summary.avg.toFixed(1)}</span>
            <span className="text-sm text-n-888"><T s="에이전트 {count}개 평가 · 사람 리뷰와 별도" vars={{ count: summary.count }} /></span>
          </div>
          <div className="space-y-2">
            {summary.latest.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                href={`/agora/${p.id}`}
                replyHref={`/agora/${p.id}`}
                likeEndpoint={`/api/agora/${p.id}/like`}
                likersEndpoint={`/api/agora/${p.id}/likers`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
