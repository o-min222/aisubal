'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ChevronUp,
  ExternalLink,
  Code2,
  Globe,
  Loader2,
  MessageSquare,
  Megaphone,
  Rocket,
} from 'lucide-react'
import type { ProductWithDetails } from '@/lib/data/types'
import { AuthorAvatar } from '@/components/user-avatar'
import { RelativeTime } from '@/components/relative-time'
import { publicAuthorLabel } from '@/lib/profile'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

/** Launch details (upvotes, screenshots, makers, updates, comments) for a tool that came from 프로덕트 런치. */
export function LaunchSection({ product: initialProduct }: { product: ProductWithDetails }) {
  const [product, setProduct] = useState(initialProduct)
  const [upvoting, setUpvoting] = useState(false)

  async function toggleUpvote() {
    if (upvoting) return
    setUpvoting(true)
    const method = product.user_upvoted ? 'DELETE' : 'POST'
    try {
      const res = await fetch(`/api/products/${product.id}/upvote`, { method })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || tn('업보트 처리 실패'))
        return
      }
      setProduct(data.product as ProductWithDetails)
    } catch {
      toast.error(tn('네트워크 오류'))
    } finally {
      setUpvoting(false)
    }
  }

  return (
    <>
      <section className="card p-5 launch-card" aria-label={tx('프로덕트 런치')}>
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Rocket className="w-4 h-4 text-c-c2581f" />
              <h2 className="font-semibold text-n-111"><T>프로덕트 런치</T></h2>
              <span className="text-xs text-n-888">
                <RelativeTime date={product.created_at} />
              </span>
            </div>
            <p className="text-sm text-n-666 mt-1">{product.tagline}</p>
            <div className="flex flex-wrap items-center gap-3 text-sm mt-3">
              {product.website_url && (
                <a href={product.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link">
                  <Globe className="w-4 h-4" /> <T>웹사이트</T> <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              {product.app_store_url && (
                <a href={product.app_store_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link">
                  App Store <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              {product.github_url && (
                <a href={product.github_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link">
                  <Code2 className="w-4 h-4" /> GitHub <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              {product.launch_post_id && (
                <Link href={`/posts/${product.launch_post_id}`} className="text-link">
                  <T>런치 게시물 보기</T>
                </Link>
              )}
            </div>
          </div>
          <button
            type="button"
            disabled={upvoting}
            onClick={toggleUpvote}
            className={`upvote-btn flex-shrink-0 ${product.user_upvoted ? 'active' : ''}`}
            aria-pressed={product.user_upvoted}
            aria-label={product.user_upvoted ? tx('업보트 취소') : tx('업보트')}
          >
            {upvoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronUp />}
            <span>{product.upvote_count}</span>
          </button>
        </div>

        {product.screenshots.length > 0 && (
          <div className="mt-4 -mx-2">
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {product.screenshots.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${src}-${i}`}
                  src={src}
                  alt={tx('{name} 스크린샷 {v}', { name: product.name, v: i + 1 })}
                  className="h-44 sm:h-52 w-auto max-w-[min(100%,420px)] rounded-lg border border-n-e5e5e5 object-cover flex-shrink-0 snap-start bg-n-f7f7f7"
                />
              ))}
            </div>
          </div>
        )}

        {product.makers.length > 0 && (
          <div className="mt-4 pt-4 border-t border-n-eee">
            <h3 className="text-sm font-semibold text-n-333 mb-2"><T>메이커</T></h3>
            <ul className="flex flex-wrap gap-3">
              {product.makers.map((maker) => (
                <li key={maker.id} className="flex items-center gap-2">
                  <AuthorAvatar author={maker} size="sm" />
                  <span className="text-sm font-medium text-n-111">{publicAuthorLabel(maker)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {product.updates.length > 0 && (
        <section className="card p-6 mb-6">
          <h2 className="text-lg font-bold text-n-111 mb-4 flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            <T>메이커 업데이트</T>
          </h2>
          <ul className="space-y-4">
            {product.updates.map((update) => (
              <li key={update.id} className="border-b border-n-e5e5e5 last:border-0 pb-4 last:pb-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h3 className="font-semibold text-n-111">{update.title}</h3>
                  <span className="text-xs text-n-888">
                    <RelativeTime date={update.created_at} />
                  </span>
                </div>
                <p className="text-sm text-n-666 mt-2 leading-relaxed">{update.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6">
        <h2 className="text-lg font-bold text-n-111 mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          <T>댓글</T>
          <span className="text-sm font-normal text-n-888">{product.comments.length}</span>
        </h2>
        {product.comments.length === 0 ? (
          <p className="text-sm text-n-888"><T>아직 댓글이 없습니다.</T></p>
        ) : (
          <ul className="space-y-4">
            {product.comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <AuthorAvatar author={comment.author} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-medium text-n-111">{publicAuthorLabel(comment.author)}</span>
                    <span className="text-n-888">·</span>
                    <span className="text-n-888">
                      <RelativeTime date={comment.created_at} />
                    </span>
                  </div>
                  <p className="text-sm text-n-333 mt-1 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}