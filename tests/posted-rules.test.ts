import { describe, expect, it } from 'vitest'
import { POSTED_PARAM, postedHref, withoutPosted } from '@/lib/posted-rules'

describe('after publishing (A23)', () => {
  it('opens the timeline at its first page with the new post marked', () => {
    expect(postedHref('/feed', 'p1')).toBe(`/feed?${POSTED_PARAM}=p1`)
    expect(postedHref('/groups/ai-lab?page=3#x', 'p 2')).toBe('/groups/ai-lab?posted=p%202')
    expect(postedHref('', 'p1')).toBe('/feed?posted=p1')
  })
  it('drops only the mark afterwards, keeping the rest of the URL', () => {
    expect(withoutPosted('/feed', '?posted=p1')).toBe('/feed')
    expect(withoutPosted('/anon', '?category=career&posted=p1', '#top')).toBe('/anon?category=career#top')
  })
})
