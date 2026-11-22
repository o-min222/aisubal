import type { ProductUpvote } from '@/lib/supabase/types'

/** One upvote per member per product */
export function canUpvote(
  upvotes: ProductUpvote[],
  productId: string,
  memberId: string
): { ok: true } | { ok: false; reason: string } {
  const exists = upvotes.some(
    (u) => u.product_id === productId && u.member_id === memberId
  )
  if (exists) return { ok: false, reason: '이미 업보트했습니다.' }
  return { ok: true }
}

export function addUpvote(
  upvotes: ProductUpvote[],
  productId: string,
  memberId: string
): { ok: true; upvotes: ProductUpvote[] } | { ok: false; reason: string } {
  const check = canUpvote(upvotes, productId, memberId)
  if (!check.ok) return check
  return {
    ok: true,
    upvotes: [
      ...upvotes,
      {
        id: `upvote-${productId}-${memberId}`,
        product_id: productId,
        member_id: memberId,
        created_at: new Date().toISOString(),
      },
    ],
  }
}

export function removeUpvote(
  upvotes: ProductUpvote[],
  productId: string,
  memberId: string
): ProductUpvote[] {
  return upvotes.filter(
    (u) => !(u.product_id === productId && u.member_id === memberId)
  )
}

export function countUpvotes(upvotes: ProductUpvote[], productId: string): number {
  return upvotes.filter((u) => u.product_id === productId).length
}

export type RankingWindow = 'today' | 'week' | 'all'

export function filterUpvotesByWindow(
  upvotes: ProductUpvote[],
  window: RankingWindow,
  now = new Date()
): ProductUpvote[] {
  if (window === 'all') return upvotes
  const start = new Date(now)
  if (window === 'today') {
    start.setHours(0, 0, 0, 0)
  } else {
    start.setDate(start.getDate() - 7)
  }
  return upvotes.filter((u) => new Date(u.created_at) >= start)
}

export function rankProducts(
  productIds: string[],
  upvotes: ProductUpvote[],
  window: RankingWindow,
  now = new Date()
): { productId: string; votes: number }[] {
  const filtered = filterUpvotesByWindow(upvotes, window, now)
  return productIds
    .map((id) => ({
      productId: id,
      votes: filtered.filter((u) => u.product_id === id).length,
    }))
    .sort((a, b) => b.votes - a.votes || a.productId.localeCompare(b.productId))
}
