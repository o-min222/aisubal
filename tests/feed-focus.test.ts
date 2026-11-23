import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stripPreviewedUrls } from '@/lib/link-strip'
import { feedHref, parseFeedScope } from '@/lib/social-rules'

const yt = 'https://youtube.com/shorts/abc123?si=xyz'

describe('A59 bare URLs next to a preview card', () => {
  it('drops a URL that is its own line', () => {
    expect(stripPreviewedUrls(`이거 꼭 보세요\n${yt}`, [yt])).toBe('이거 꼭 보세요')
    expect(stripPreviewedUrls(`${yt}\n\n이거 꼭 보세요`, [yt])).toBe('이거 꼭 보세요')
  })
  it('drops a trailing URL, also with punctuation or a trailing slash difference', () => {
    expect(stripPreviewedUrls('좋은 글 https://lnkd.in/gAbC.', ['https://lnkd.in/gAbC'])).toBe('좋은 글')
    expect(stripPreviewedUrls('좋은 글 https://example.com/a/', ['http://www.example.com/a'])).toBe('좋은 글')
  })
  it('keeps a URL in the middle of a sentence, and URLs without a card', () => {
    const mid = `여기 ${yt} 보고 나서 정리했어요`
    expect(stripPreviewedUrls(mid, [yt])).toBe(mid)
    expect(stripPreviewedUrls('참고 https://other.dev/x', [yt])).toBe('참고 https://other.dev/x')
  })
  it('a post that is only the link becomes empty (the card says it all)', () => {
    expect(stripPreviewedUrls(`  ${yt}  `, [yt])).toBe('')
  })
})

describe('A59 feed filter', () => {
  it('?f= with the old ?scope= still parsed', () => {
    expect(feedHref('all')).toBe('/feed')
    expect(feedHref('popular')).toBe('/feed?f=popular')
    expect(parseFeedScope('friends')).toBe('friends')
  })
  it('the feed page has no tab bar, and the default stays 전체', () => {
    const page = readFileSync('src/app/(app)/feed/page.tsx', 'utf8')
    expect(page).not.toMatch(/LinkTabs/)
    expect(page).toMatch(/parseFeedScope\(sp\.f \?\? sp\.scope\)/)
    expect(parseFeedScope(undefined)).toBe('all')
  })
})
