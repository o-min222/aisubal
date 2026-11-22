import { describe, it, expect, beforeEach } from 'vitest'
import {
  addUpvote,
  canUpvote,
  countUpvotes,
  filterUpvotesByWindow,
  rankProducts,
  removeUpvote,
} from '@/lib/product-rules'
import type { ProductUpvote } from '@/lib/supabase/types'
import { resetProductUpvotes } from '@/lib/mock-products'

describe('프로덕트 업보트 유니크 / 랭킹', () => {
  beforeEach(() => {
    resetProductUpvotes()
  })

  it('멤버당 프로덕트 하나만 업보트 가능', () => {
    let votes: ProductUpvote[] = []
    const first = addUpvote(votes, 'product-1', 'member-1')
    expect(first.ok).toBe(true)
    if (!first.ok) return
    votes = first.upvotes
    expect(countUpvotes(votes, 'product-1')).toBe(1)

    const dup = addUpvote(votes, 'product-1', 'member-1')
    expect(dup.ok).toBe(false)
    expect(canUpvote(votes, 'product-1', 'member-1').ok).toBe(false)

    const other = addUpvote(votes, 'product-1', 'member-2')
    expect(other.ok).toBe(true)
    if (other.ok) {
      expect(countUpvotes(other.upvotes, 'product-1')).toBe(2)
    }
  })

  it('업보트 취소 후 다시 가능', () => {
    let votes = addUpvote([], 'product-1', 'member-1')
    expect(votes.ok).toBe(true)
    if (!votes.ok) return
    votes = { ok: true, upvotes: removeUpvote(votes.upvotes, 'product-1', 'member-1') }
    expect(canUpvote(votes.upvotes, 'product-1', 'member-1').ok).toBe(true)
  })

  it('today / week / all 윈도우로 랭킹', () => {
    const now = new Date('2026-11-21T15:00:00+09:00')
    const upvotes: ProductUpvote[] = [
      {
        id: '1',
        product_id: 'a',
        member_id: 'm1',
        created_at: '2026-11-21T01:00:00Z',
      },
      {
        id: '2',
        product_id: 'a',
        member_id: 'm2',
        created_at: '2026-11-10T01:00:00Z',
      },
      {
        id: '3',
        product_id: 'b',
        member_id: 'm1',
        created_at: '2026-11-20T01:00:00Z',
      },
      {
        id: '4',
        product_id: 'b',
        member_id: 'm2',
        created_at: '2026-11-18T01:00:00Z',
      },
      {
        id: '5',
        product_id: 'b',
        member_id: 'm3',
        created_at: '2026-10-01T01:00:00Z',
      },
    ]

    expect(filterUpvotesByWindow(upvotes, 'today', now)).toHaveLength(1)
    expect(filterUpvotesByWindow(upvotes, 'week', now).length).toBeGreaterThanOrEqual(3)
    expect(filterUpvotesByWindow(upvotes, 'all', now)).toHaveLength(5)

    const rankedAll = rankProducts(['a', 'b'], upvotes, 'all', now)
    expect(rankedAll[0].productId).toBe('b')
    expect(rankedAll[0].votes).toBe(3)

    const rankedToday = rankProducts(['a', 'b'], upvotes, 'today', now)
    expect(rankedToday[0].productId).toBe('a')
    expect(rankedToday[0].votes).toBe(1)
  })
})
