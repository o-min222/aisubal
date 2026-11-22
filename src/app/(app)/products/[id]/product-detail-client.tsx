'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronUp,
  ExternalLink,
  Code2,
  Globe,
  Loader2,
  MessageSquare,
  Megaphone,
} from 'lucide-react'
import type { ProductWithDetails } from '@/lib/data/types'
import { AuthorAvatar } from '@/components/user-avatar'
import { MarkdownBody } from '@/components/markdown-body'
import { RelativeTime } from '@/components/relative-time'
import { SaveToArchiveButton } from '@/components/save-to-archive-button'
import { publicAuthorLabel } from '@/lib/profile'
import { toast } from 'sonner'

interface ProductDetailClientProps {
  product: ProductWithDetails
}

export function ProductDetailClient({ product: initialProduct }: ProductDetailClientProps) {
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
        toast.error(data.error || '업보트 처리 실패')
        return
      }
      setProduct(data.product as ProductWithDetails)
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setUpvoting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/products"
        className="inline-flex items-center gap-2 text-sm text-[#666] hover:text-[#111] mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        프로덕트 목록
      </Link>

      <article className="card p-6 mb-6">
        <div className="flex gap-4 items-start">
          {product.logo_url ? (
            <img
              src={product.logo_url}
              alt=""
              className="w-16 h-16 rounded-xl object-cover border border-[#e5e5e5] bg-white flex-shrink-0"
            />
          ) : (
            <div className="product-icon w-16 h-16 text-xl flex-shrink-0">
              {product.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-[#111] mb-1">{product.name}</h1>
            <p className="text-[#666] mb-3">{product.tagline}</p>

            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {product.tags.map((tag) => (
                  <span key={tag} className="badge badge-note">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 text-sm">
              {product.website_url && (
                <a
                  href={product.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#0066cc] hover:underline"
                >
                  <Globe className="w-4 h-4" />
                  웹사이트
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              {product.app_store_url && (
                <a
                  href={product.app_store_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#0066cc] hover:underline"
                >
                  App Store
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              {product.github_url && (
                <a
                  href={product.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#0066cc] hover:underline"
                >
                  <Code2 className="w-4 h-4" />
                  GitHub
                  <ExternalLink className="w-3 h-3 opacity-60" />
                </a>
              )}
              <SaveToArchiveButton
                sourceType="product"
                sourceId={product.id}
                title={product.name}
              />
              {product.launch_post_id && (
                <Link href={`/posts/${product.launch_post_id}`} className="text-[#0066cc] hover:underline">
                  런치 게시물 보기
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
          >
            {upvoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronUp />}
            <span>{product.upvote_count}</span>
          </button>
        </div>

        {product.screenshots.length > 0 && (
          <div className="mt-6 -mx-2">
            <div className="flex gap-3 overflow-x-auto pb-2 px-2 snap-x snap-mandatory">
              {product.screenshots.map((src, i) => (
                <img
                  key={`${src}-${i}`}
                  src={src}
                  alt={`${product.name} 스크린샷 ${i + 1}`}
                  className="h-48 sm:h-56 w-auto max-w-[min(100%,420px)] rounded-lg border border-[#e5e5e5] object-cover flex-shrink-0 snap-start bg-[#f7f7f7]"
                />
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-[#e5e5e5]">
          <MarkdownBody content={product.description} />
        </div>
      </article>

      <section className="card p-6 mb-6">
        <h2 className="text-lg font-bold text-[#111] mb-4">메이커</h2>
        <ul className="space-y-3">
          {product.makers.map((maker) => (
            <li key={maker.id} className="flex items-center gap-3">
              <AuthorAvatar author={maker} />
              <div>
                <div className="font-medium text-[#111]">{publicAuthorLabel(maker)}</div>
                {maker.kind === 'nickname' && (
                  <span className="text-xs text-[#888]">별명 프로필</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {product.updates.length > 0 && (
        <section className="card p-6 mb-6">
          <h2 className="text-lg font-bold text-[#111] mb-4 flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            메이커 업데이트
          </h2>
          <ul className="space-y-4">
            {product.updates.map((update) => (
              <li key={update.id} className="border-b border-[#e5e5e5] last:border-0 pb-4 last:pb-0">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <h3 className="font-semibold text-[#111]">{update.title}</h3>
                  <span className="text-xs text-[#888]">
                    <RelativeTime date={update.created_at} />
                  </span>
                </div>
                <p className="text-sm text-[#666] mt-2 leading-relaxed">{update.body}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-6">
        <h2 className="text-lg font-bold text-[#111] mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          댓글
          <span className="text-sm font-normal text-[#888]">{product.comments.length}</span>
        </h2>
        {product.comments.length === 0 ? (
          <p className="text-sm text-[#888]">아직 댓글이 없습니다.</p>
        ) : (
          <ul className="space-y-4">
            {product.comments.map((comment) => (
              <li key={comment.id} className="flex gap-3">
                <AuthorAvatar author={comment.author} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="font-medium text-[#111]">{publicAuthorLabel(comment.author)}</span>
                    <span className="text-[#888]">·</span>
                    <span className="text-[#888]">
                      <RelativeTime date={comment.created_at} />
                    </span>
                  </div>
                  <p className="text-sm text-[#333] mt-1 leading-relaxed whitespace-pre-wrap">{comment.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}