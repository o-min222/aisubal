import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { knownSiteIcon, sanitizePreview } from '@/lib/link-preview'

describe('link preview site icons', () => {
  it('known hosts get their real icon (never a letter for GitHub)', () => {
    expect(knownSiteIcon('https://github.com/upstash/context7')).toBe('https://github.githubassets.com/apple-touch-icon-180x180.png')
    expect(knownSiteIcon('https://gist.github.com/a/b')).toMatch(/githubassets/)
    expect(knownSiteIcon('https://youtu.be/abc')).toBe('https://www.youtube.com/favicon.ico')
    expect(knownSiteIcon('https://x.com/a/status/1')).toMatch(/twimg\.com/)
    expect(knownSiteIcon('https://en.m.wikipedia.org/wiki/A')).toMatch(/wikipedia/)
  })
  it('unknown or look-alike hosts get none (the letter stays the last resort)', () => {
    expect(knownSiteIcon('https://example.com/')).toBeNull()
    expect(knownSiteIcon('https://github.com.evil.io/x')).toBeNull()
    expect(knownSiteIcon('https://notgithub.com/x')).toBeNull()
    expect(knownSiteIcon('not a url')).toBeNull()
  })
  it('every known icon is https and survives the stored-preview sanitizer', () => {
    for (const u of ['https://github.com/a', 'https://huggingface.co/m', 'https://www.notion.so/p', 'https://chatgpt.com/', 'https://claude.ai/']) {
      const icon = knownSiteIcon(u)!
      expect(icon).toMatch(/^https:\/\//)
      expect(sanitizePreview({ url: u, title: 't', description: null, image: null, site_name: null, favicon: icon, link_type: 'article' }).favicon).toBe(icon)
    }
  })
  it('the unfurl prefers the page’s checked icon, then the known host; the fallback card uses the known host', () => {
    const src = readFileSync('src/lib/link-preview-server.ts', 'utf8')
    expect(src).toMatch(/await resolvePageIcon\(html, base\)[\s\S]{0,60}\|\| knownSiteIcon\(base\) \|\| knownSiteIcon\(url\)/)
    expect(src).toContain('favicon: knownSiteIcon(url),\n    link_type: type,')
    expect(src).not.toMatch(/favicon: null/)
  })
})
