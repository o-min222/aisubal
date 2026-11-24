import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/gallery', useSearchParams: () => new URLSearchParams() }))

import { dateBucket, groupHeaderAt } from '@/lib/gallery-rows'
import { popularityScore } from '@/lib/tool-rules'
import { GalleryRow } from '@/components/tools/gallery-row'
import type { ToolListItem } from '@/lib/tool-rules'

// Tue 2026-11-24 21:00 KST
const NOW = new Date('2026-11-24T12:00:00Z')

describe('A84 Product Hunt-style gallery', () => {
  it('date groups in KST: 오늘 / 이번 주 (since Monday) / 이번 달 / 그 전', () => {
    expect(dateBucket('2026-11-24T00:30:00+09:00', NOW)).toBe('today')
    expect(dateBucket('2026-11-23T23:59:00+09:00', NOW)).toBe('week') // Monday
    expect(dateBucket('2026-11-22T23:59:00+09:00', NOW)).toBe('month') // Sunday before
    expect(dateBucket('2026-11-01T00:00:00+09:00', NOW)).toBe('month')
    expect(dateBucket('2026-10-31T23:59:00+09:00', NOW)).toBe('earlier')
    // a UTC time that is already the next KST day
    expect(dateBucket('2026-11-23T15:30:00Z', NOW)).toBe('today')
  })

  it('group headers appear once per group, continuing across pages', () => {
    const c = ['2026-11-24T10:00:00+09:00', '2026-11-24T09:00:00+09:00', '2026-11-23T09:00:00+09:00', '2026-11-02T09:00:00+09:00']
    expect(c.map((_, i) => groupHeaderAt(c, i, null, NOW))).toEqual(['today', null, 'week', 'month'])
    expect(groupHeaderAt(['2026-11-24T08:00:00+09:00'], 0, '2026-11-24T10:00:00+09:00', NOW)).toBeNull()
  })

  it('popular ranks follow the ▲ upvote (= 좋아요)', () => {
    const base = { user_count: 0, mention_count: 0, install_count: 0, upvote_count: 0, avg_rating: 0, rating_count: 0, featured: false } as unknown as ToolListItem
    expect(popularityScore({ ...base, like_count: 5 })).toBeGreaterThan(popularityScore({ ...base, like_count: 1 }))
  })

  it('row: rank, logo, bold name, tagline, muted meta, quiet bookmark and an upvote box with the like count', () => {
    const tool = {
      id: 't1', slug: 'herdr', name: 'Herdr', one_liner: '내 에이전트를 한곳에서', type: 'mcp_server', tags: ['cli', 'agent', 'extra'], icon_url: null,
      user_count: 3, like_count: 12, liked_by_me: true, used_by_me: false, rating_count: 0, avg_rating: 0, created_at: '2026-11-24T00:00:00Z',
    } as unknown as ToolListItem
    const html = renderToStaticMarkup(createElement(GalleryRow, { tool, href: '/gallery?open=herdr', rank: 1, sort: 'popular', usage: { friends: 1, following: 0, stack: [] } as never }))
    expect(html).toMatch(/class="ph-rank[^"]*">1</)
    expect(html).toContain('class="ph-name">Herdr<')
    expect(html).toContain('ph-tagline')
    expect(html).toContain('#cli')
    expect(html).not.toContain('#extra')
    expect(html).toContain('친구 1명이 써요')
    expect(html).toMatch(/class="ph-vote on"[^>]*aria-pressed="true"/)
    expect(html).toMatch(/<span class="tabular-nums">12<\/span>/)
    // the vote and the bookmark are siblings of the row link, never inside it
    const link = html.slice(html.indexOf('<a '), html.indexOf('</a>'))
    expect(link).not.toContain('ph-vote')
    expect(link).not.toContain('ph-save')
    expect(renderToStaticMarkup(createElement(GalleryRow, { tool, href: '/x', rank: null, sort: 'newest' }))).not.toContain('ph-rank')
  })
})
