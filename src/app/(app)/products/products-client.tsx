'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronUp, Loader2, Rocket, Sparkles, Tag } from 'lucide-react'
import type { ProductWithDetails } from '@/lib/data/types'
import type { RankingWindow } from '@/lib/product-rules'
import { AuthorAvatar } from '@/components/user-avatar'
import { publicAuthorLabel } from '@/lib/profile'
import { toast } from 'sonner'

interface ProductsClientProps {
  initialProducts: ProductWithDetails[]
  featured: ProductWithDetails[]
}

const WINDOW_TABS: { key: RankingWindow; label: string }[] = [
  { key: 'today', label: '오늘' },
  { key: 'week', label: '이번 주' },
  { key: 'all', label: '전체' },
]

export function ProductsClient({ initialProducts, featured }: ProductsClientProps) {
  const [window, setWindow] = useState<RankingWindow>('all')
  const [products, setProducts] = useState<ProductWithDetails[]>(initialProducts)
  const [loading, setLoading] = useState(false)
  const [upvotingId, setUpvotingId] = useState<string | null>(null)

  async function selectWindow(w: RankingWindow) {
    if (w === window) return
    setWindow(w)
    setLoading(true)
    try {
      const res = await fetch(`/api/products?window=${w}`)
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '목록을 불러오지 못했습니다.')
        return
      }
      setProducts(data.products as ProductWithDetails[])
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setLoading(false)
    }
  }

  async function toggleUpvote(e: React.MouseEvent, product: ProductWithDetails) {
    e.preventDefault()
    e.stopPropagation()
    if (upvotingId) return
    setUpvotingId(product.id)
    const method = product.user_upvoted ? 'DELETE' : 'POST'
    try {
      const res = await fetch(`/api/products/${product.id}/upvote`, { method })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || '업보트 처리 실패')
        return
      }
      const updated = data.product as ProductWithDetails
      setProducts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setUpvotingId(null)
    }
  }

  return (
    <div className="layout-grid">
      <aside className="hidden lg:block">
        <div className="left-nav">
          <Link href="/products" className="left-nav-item active">
            <Rocket className="w-4 h-4" />
            랭킹
          </Link>
          <Link href="/products/new" className="left-nav-item">
            <Sparkles className="w-4 h-4" />
            등록하기
          </Link>
        </div>
      </aside>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-[#111]">프로덕트</h1>
            <p className="text-sm text-[#666] mt-1">커뮤니티가 만든 AI·도구를 발견하고 응원하세요.</p>
          </div>
          <Link href="/products/new" className="btn btn-primary btn-sm">
            프로덕트 등록
          </Link>
        </div>

        <div className="tab-filters">
          {WINDOW_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => selectWindow(tab.key)}
              className={`tab-filter ${window === tab.key ? 'active' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="card p-8 flex items-center justify-center gap-2 text-sm text-[#888]">
            <Loader2 className="w-4 h-4 animate-spin" />
            불러오는 중...
          </div>
        ) : products.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-[#666] text-sm">이 기간에 랭킹에 올라온 프로덕트가 없습니다.</p>
            <Link href="/products/new" className="btn btn-primary btn-sm mt-4">
              첫 프로덕트 등록하기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {products.map((product, index) => (
              <ProductRow
                key={product.id}
                product={product}
                rank={index + 1}
                upvoting={upvotingId === product.id}
                onToggleUpvote={toggleUpvote}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:block space-y-4">
        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            추천 프로덕트
          </h3>
          <div>
            {featured.map((product) => (
              <Link key={product.id} href={`/products/${product.id}`} className="trending-item group">
                <ProductLogo product={product} size="sm" />
                <div className="trending-item-content min-w-0 flex-1">
                  <span className="trending-item-title group-hover:text-[#0066cc]">{product.name}</span>
                  <span className="trending-item-meta line-clamp-1">{product.tagline}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="sidebar-module">
          <h3 className="sidebar-title flex items-center gap-2">
            <Tag className="w-4 h-4" />
            안내
          </h3>
          <p className="text-sm text-[#666] leading-relaxed">
            업보트는 멤버당 프로덕트마다 한 번입니다. 오늘·이번 주 탭은 해당 기간 업보트 수로 순위를 매깁니다.
          </p>
        </div>
      </aside>
    </div>
  )
}

function ProductRow({
  product,
  rank,
  upvoting,
  onToggleUpvote,
}: {
  product: ProductWithDetails
  rank: number
  upvoting: boolean
  onToggleUpvote: (e: React.MouseEvent, product: ProductWithDetails) => void
}) {
  return (
    <Link href={`/products/${product.id}`} className="block group">
      <article className="feed-item">
        <div className="flex gap-4 items-start">
          <span className="trending-item-rank text-base w-6 flex-shrink-0 pt-1">{rank}</span>
          <ProductLogo product={product} />
          <div className="flex-1 min-w-0">
            <h3 className="feed-item-title group-hover:text-[#0066cc]">{product.name}</h3>
            <p className="feed-item-desc line-clamp-2 mb-2">{product.tagline}</p>
            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {product.tags.map((tag) => (
                  <span key={tag} className="badge badge-note">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div className="feed-item-meta flex-wrap">
              <span className="text-[#888]">메이커</span>
              <div className="flex items-center gap-2 flex-wrap">
                {product.makers.map((maker) => (
                  <span key={maker.id} className="inline-flex items-center gap-1.5">
                    <AuthorAvatar author={maker} size="sm" />
                    <span>{publicAuthorLabel(maker)}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            type="button"
            disabled={upvoting}
            onClick={(e) => onToggleUpvote(e, product)}
            className={`upvote-btn flex-shrink-0 ${product.user_upvoted ? 'active' : ''}`}
            aria-pressed={product.user_upvoted}
          >
            {upvoting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronUp />}
            <span>{product.upvote_count}</span>
          </button>
        </div>
      </article>
    </Link>
  )
}

function ProductLogo({ product, size = 'md' }: { product: ProductWithDetails; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14'
  const textSize = size === 'sm' ? 'text-sm' : 'text-lg'

  if (product.logo_url) {
    return (
      <img
        src={product.logo_url}
        alt=""
        className={`${dim} rounded-lg object-cover border border-[#e5e5e5] flex-shrink-0 bg-white`}
      />
    )
  }

  return (
    <div className={`product-icon ${dim} ${textSize}`} aria-hidden>
      {product.name.charAt(0).toUpperCase()}
    </div>
  )
}