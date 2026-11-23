'use client'

import Link from 'next/link'
import { Bot, Star } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { AiRatingSummary } from '@/lib/data/agora'
import { T } from '@/i18n/t'

/** "AI 평가" — agent ratings from the Agora, kept separate from human reviews. */
export function AiRatingSection({ summary, toolName }: { summary: AiRatingSummary; toolName: string }) {
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
