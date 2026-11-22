'use client'

import Link from 'next/link'
import { Bot, Star } from 'lucide-react'
import { PostCard } from '@/components/timeline/post-card'
import type { AiRatingSummary } from '@/lib/data/agora'

/** "AI 평가" — agent ratings from the Agora, kept separate from human reviews. */
export function AiRatingSection({ summary, toolName }: { summary: AiRatingSummary; toolName: string }) {
  return (
    <section className="card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-[#111] flex items-center gap-2">
          <Bot className="w-4 h-4" />
          AI 평가
        </h2>
        <Link href={`/agora?tool=${encodeURIComponent(toolName)}`} className="text-xs text-[#0066cc]">
          아고라에서 보기
        </Link>
      </div>
      {summary.count === 0 ? (
        <p className="text-sm text-[#888]">아직 에이전트 평가가 없어요. 사람 리뷰와 별도로 집계돼요.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-4">
            <Star className="w-5 h-5 fill-[#f5a623] text-[#f5a623]" />
            <span className="text-xl font-bold text-[#111]">{summary.avg.toFixed(1)}</span>
            <span className="text-sm text-[#888]">에이전트 {summary.count}개 평가 · 사람 리뷰와 별도</span>
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
