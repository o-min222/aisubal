import { describe, expect, it } from 'vitest'
import { extractUrls, getYoutubeId, githubOgImage, sanitizePreview, tweetTextFromOembed, MAX_LINK_PREVIEWS } from '@/lib/link-preview'
import { previewsFromRow } from '@/lib/feed-rules'
import { checkFetchUrl, isBlockedIp } from '@/lib/safe-fetch'
import { dashboardHref, pageSlice, parseDashboardTab } from '@/lib/dashboard-tabs'

describe('extractUrls', () => {
  it('finds links in order, de-duplicated, trimming punctuation and unbalanced brackets', () => {
    const t = '보세요 https://a.com/x, 그리고 (https://b.com/y) 또 https://a.com/x. 끝 https://en.wikipedia.org/wiki/Foo_(bar)'
    expect(extractUrls(t)).toEqual(['https://a.com/x', 'https://b.com/y', 'https://en.wikipedia.org/wiki/Foo_(bar)'])
  })
  it('caps at 4 by default and skips non-http and single-label hosts', () => {
    const t = 'https://1.com https://2.com https://3.com https://4.com https://5.com ftp://x.com http://localhost/a'
    expect(extractUrls(t)).toHaveLength(MAX_LINK_PREVIEWS)
    expect(extractUrls('http://localhost/a javascript:alert(1)')).toEqual([])
  })
})

describe('preview helpers', () => {
  it('reads YouTube ids from watch, youtu.be and shorts URLs', () => {
    expect(getYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(getYoutubeId('https://youtu.be/dQw4w9WgXcQ?t=3')).toBe('dQw4w9WgXcQ')
    expect(getYoutubeId('https://youtube.com/shorts/abcDEF12345')).toBe('abcDEF12345')
  })
  it('builds GitHub OG images for repos', () => {
    expect(githubOgImage('https://github.com/vercel/next.js/tree/canary')).toBe('https://opengraph.githubassets.com/1/vercel/next.js')
    expect(githubOgImage('https://example.com/a/b')).toBeNull()
  })
  it('extracts tweet text from oEmbed html', () => {
    expect(tweetTextFromOembed('<blockquote><p lang="ko">안녕 &amp; <a href="#">#AI</a><br>둘째줄</p>&mdash; X</blockquote>')).toBe('안녕 & #AI 둘째줄')
  })
  it('sanitizes: decodes entities, https-only images, trims lengths', () => {
    const p = sanitizePreview({ url: 'https://a.com', title: ' A &amp; B ', description: 'x'.repeat(400), image: 'http://a.com/i.png', site_name: 'A', favicon: 'https://a.com/f.ico', link_type: 'article' })
    expect(p.title).toBe('A & B')
    expect(p.description).toHaveLength(300)
    expect(p.image).toBeNull()
    expect(p.favicon).toBe('https://a.com/f.ico')
  })
  it('maps stored link_previews rows (max 4, ignores junk)', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({ url: `https://${i}.com`, title: `t${i}`, description: null, image: null, site_name: null, favicon: null, link_type: 'article' as const }))
    const out = previewsFromRow({ link_previews: rows })
    expect(out).toHaveLength(4)
    expect(out[0]).toMatchObject({ url: 'https://1.com', title: 't1', siteName: null })
    expect(previewsFromRow({ link_previews: null })).toEqual([])
  })
})

describe('SSRF guard used by previews', () => {
  it('blocks private, loopback, link-local and metadata addresses', () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.3.4', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1']) {
      expect(isBlockedIp(ip), ip).toBe(true)
    }
    expect(isBlockedIp('8.8.8.8')).toBe(false)
  })
  it('rejects bad schemes, ports, credentials and internal hosts', () => {
    expect(checkFetchUrl('file:///etc/passwd').ok).toBe(false)
    expect(checkFetchUrl('http://example.com:8080/').ok).toBe(false)
    expect(checkFetchUrl('https://user:pw@example.com/').ok).toBe(false)
    expect(checkFetchUrl('http://localhost/').ok).toBe(false)
    expect(checkFetchUrl('http://metadata.google.internal/').ok).toBe(false)
    expect(checkFetchUrl('http://169.254.169.254/latest/meta-data').ok).toBe(false)
    expect(checkFetchUrl('https://github.com/vercel/next.js').ok).toBe(true)
  })
})

describe('dashboard tabs', () => {
  it('parses tabs and builds hrefs', () => {
    expect(parseDashboardTab('likes')).toBe('likes')
    expect(parseDashboardTab('nope')).toBe('posts')
    expect(dashboardHref('posts')).toBe('/me')
    expect(dashboardHref('moim', 2)).toBe('/me?tab=moim&page=2')
  })
  it('slices pages and clamps out-of-range pages', () => {
    const items = Array.from({ length: 45 }, (_, i) => i)
    expect(pageSlice(items, 3, 20)).toEqual({ items: [40, 41, 42, 43, 44], totalPages: 3, page: 3 })
    expect(pageSlice(items, 9, 20).page).toBe(3)
    expect(pageSlice([], 1, 20)).toEqual({ items: [], totalPages: 1, page: 1 })
  })
})
