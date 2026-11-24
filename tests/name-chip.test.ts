import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {}, push() {} }), usePathname: () => '/feed', useSearchParams: () => new URLSearchParams() }))

import { nameChip } from '@/lib/social-rules'
import { PostCard } from '@/components/timeline/post-card'
import type { TimelinePost } from '@/components/timeline/types'

const post = (follow: NonNullable<TimelinePost['author']['follow']> | undefined, reply = false): TimelinePost =>
  ({
    id: 'p1', parentId: reply ? 'p0' : null, rootId: reply ? 'p0' : null,
    author: { kind: 'member', id: 'm1', name: '제니나이아주아주긴이름입니다정말로길어요', handle: 'jennynai_long_handle', follow },
    body: 'hi', linkUrl: null, imageUrl: null, createdAt: '2026-11-24T00:00:00Z', likeCount: 0, replyCount: 0, likedByMe: false,
  }) as unknown as TimelinePost

const EP = { likeEndpoint: '/api/posts/p1/like', likersEndpoint: '/api/posts/p1/likers' }
const chips = (html: string) => (html.match(/>(맞팔|팔로잉|\+ 팔로우|친구|나를 팔로우)</g) ?? []).map((m) => m.slice(1, -1))
const who = (html: string) => html.slice(html.indexOf('class="tc-who"'), html.indexOf('class="tc-meta'))

describe('A82 one relationship chip after the name', () => {
  it('rule: 맞팔 for mutual, 팔로잉 when only I follow, nothing otherwise', () => {
    expect(nameChip({ iFollow: true, followsMe: true })).toBe('맞팔')
    expect(nameChip({ iFollow: true, followsMe: false })).toBe('팔로잉')
    expect(nameChip({ iFollow: false, followsMe: true })).toBeNull()
    expect(nameChip({ iFollow: false })).toBeNull()
  })

  it('post card: exactly one chip, inside the name line, no floating follow toggle', () => {
    const cases: Array<[NonNullable<TimelinePost['author']['follow']>, string[]]> = [
      [{ following: true, followsMe: true, badge: '맞팔' }, ['맞팔']],
      [{ following: true, followsMe: false, badge: '팔로잉' }, ['팔로잉']],
      [{ following: true, followsMe: true, badge: '친구' }, ['맞팔']],
      [{ following: false, followsMe: true, badge: '나를 팔로우' }, ['+ 팔로우']],
      [{ following: false, followsMe: false, badge: null }, ['+ 팔로우']],
    ]
    for (const [follow, want] of cases) {
      const html = renderToStaticMarkup(createElement(PostCard, { post: post(follow), ...EP }))
      expect(chips(html)).toEqual(want)
      expect(chips(who(html))).toEqual(want)
      expect(html).not.toContain('ml-auto')
    }
  })

  it('comments: the chip when I follow, never a follow button', () => {
    expect(chips(renderToStaticMarkup(createElement(PostCard, { post: post({ following: true, followsMe: true, badge: '맞팔' }, true), isReply: true, ...EP })))).toEqual(['맞팔'])
    expect(chips(renderToStaticMarkup(createElement(PostCard, { post: post({ following: false, followsMe: true, badge: '나를 팔로우' }, true), isReply: true, ...EP })))).toEqual([])
  })
})
