import { describe, expect, it } from 'vitest'
import { detectLinkKind, shortLinkLabel, validateLink } from '@/lib/profile-rules'

describe('A47 SNS link editor', () => {
  it('reads the platform from the URL; unknown → 웹사이트, blog stays blog', () => {
    expect(detectLinkKind('github.com/colin')).toBe('github')
    expect(detectLinkKind('https://twitter.com/colin')).toBe('x')
    expect(detectLinkKind('http://www.instagram.com/colin')).toBe('instagram')
    expect(detectLinkKind('https://kr.linkedin.com/in/colin')).toBe('linkedin')
    expect(detectLinkKind('colin.dev')).toBe('website')
    expect(detectLinkKind('colin.dev', 'blog')).toBe('blog')
    expect(validateLink(detectLinkKind('github.com/colin'), 'github.com/colin')).toEqual({ ok: true, url: 'https://github.com/colin' })
  })
  it('short labels: @handle for social, handle for others, host/path otherwise', () => {
    expect(shortLinkLabel('x', 'https://x.com/colin')).toBe('@colin')
    expect(shortLinkLabel('youtube', 'https://youtube.com/@colin')).toBe('@colin')
    expect(shortLinkLabel('github', 'https://github.com/colin')).toBe('colin')
    expect(shortLinkLabel('linkedin', 'https://linkedin.com/in/colin')).toBe('colin')
    expect(shortLinkLabel('website', 'https://www.colin.dev/')).toBe('colin.dev')
    expect(shortLinkLabel('website', `https://colin.dev/${'a'.repeat(60)}`).endsWith('…')).toBe(true)
  })
})
