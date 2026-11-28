import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A142 · share on article cards', () => {
  it('the feed card and the /articles card reuse ArticleShareButton, outside the hit link', () => {
    const feed = read('src/components/articles/article-feed-card.tsx')
    expect(feed).toContain('ArticleShareButton')
    expect(feed).toContain('variant="feed"')
    expect(feed).toContain('article-feed-hit')
    expect(feed).toContain('article-feed-meta-row')
    expect(feed).toContain('<ArticleShareButton slug={a.slug}')
    expect(feed.indexOf('<ArticleShareButton slug={a.slug}')).toBeGreaterThan(feed.indexOf('article-feed-hit'))
    expect(feed).toContain('<div className="article-feed-meta">')
    expect(feed).not.toMatch(/<Link[^>]*className="article-feed-link"[\s\S]*ArticleShareButton/)

    const list = read('src/components/articles/article-card.tsx')
    expect(list).toContain('ArticleShareButton')
    expect(list).toContain('variant="feed"')
    expect(list).toContain('article-card-hit')
    expect(list).toContain("article.status === 'published'")
    expect(list).not.toMatch(/<Link[^>]*article-card-link[\s\S]*ArticleShareButton/)
  })

  it('the feed variant matches the post share icon and always stops the click', () => {
    const btn = read('src/components/articles/article-share-button.tsx')
    expect(btn).toContain("variant?: 'icon' | 'pill' | 'feed'")
    expect(btn).toContain('e.stopPropagation()')
    expect(btn).toContain('e.preventDefault()')
    expect(btn).toContain('onPointerDown: stop')
    expect(btn).toContain('w-[17px] h-[17px]')
    expect(btn).toContain('tap-target')
    expect(btn).toContain('icon-btn')
    const post = read('src/components/timeline/post-card.tsx')
    expect(post).toContain('<Share2 className="w-[17px] h-[17px]" />')
    expect(post).toContain('tc-act tap-target inline-flex items-center justify-center rounded-full icon-btn')
  })

  it('the meta row keeps the icon out of the wrapping text', () => {
    const css = read('src/app/globals.css')
    expect(css).toMatch(/\.article-feed-meta-row \{[^}]*display: flex/)
    expect(css).toMatch(/\.article-feed-meta \{[^}]*flex: 1 1 auto/)
    expect(css).toMatch(/\.article-feed-meta \{[^}]*min-width: 0/)
    expect(css).toMatch(/\.article-card-foot-end \{[^}]*margin-left: auto/)
    expect(css).toMatch(/\.article-feed-share \{[^}]*flex: none/)
    expect(css).toMatch(/\.article-feed-hit, \.article-card-hit \{[^}]*position: absolute/)
  })
})
