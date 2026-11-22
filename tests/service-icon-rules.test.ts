import { describe, expect, it } from 'vitest'
import { githubOwnerAvatar, iconCandidates, siteForIcons } from '@/lib/service-icon-rules'

describe('service icon sources', () => {
  it('uses the GitHub owner avatar for repos and tree URLs', () => {
    expect(githubOwnerAvatar({ url: 'https://github.com/anthropics/claude-code' })).toBe('https://github.com/anthropics.png?size=128')
    expect(githubOwnerAvatar({ url: 'https://github.com/cursor/plugins/tree/main/pstack' })).toBe('https://github.com/cursor.png?size=128')
    expect(githubOwnerAvatar({ url: 'https://vercel.com/docs/mcp/vercel-mcp' })).toBeNull()
  })
  it('reads icons from the homepage, never from github.com', () => {
    expect(siteForIcons({ url: 'https://github.com/ollama/ollama', homepageUrl: 'https://ollama.com' })).toBe('https://ollama.com/')
    expect(siteForIcons({ url: 'https://github.com/a/b', homepageUrl: 'https://github.com/a/b#readme' })).toBeNull()
    expect(siteForIcons({ url: 'http://insecure.example' })).toBeNull()
  })
  it('ranks apple-touch-icon > big icon > shortcut icon, then conventional paths', () => {
    const html = `<link rel="shortcut icon" href="/favicon.ico"><link rel="icon" sizes="32x32" href="/32.png">
      <link rel="icon" href="/logo.svg"><link rel="apple-touch-icon" href="https://cdn.x.com/a-180.png?a=1&amp;b=2"><link rel="stylesheet" href="/s.css">`
    expect(iconCandidates(html, 'https://x.com/docs/page')).toEqual([
      'https://cdn.x.com/a-180.png?a=1&b=2',
      'https://x.com/logo.svg',
      'https://x.com/32.png',
      'https://x.com/favicon.ico',
      'https://x.com/apple-touch-icon.png',
    ])
  })
  it('drops non-https icons and still offers the conventional paths', () => {
    expect(iconCandidates('<link rel="icon" href="http://x.com/i.png">', 'https://x.com/')).toEqual(['https://x.com/apple-touch-icon.png', 'https://x.com/favicon.ico'])
  })
})
