import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

/** AI-80: "thumbnail & share button weird" on the /feed article card. */
describe('A145 · feed article card layout', () => {
  const feed = read('src/components/articles/article-feed-card.tsx')
  const css = read('src/app/globals.css')

  it('title block and thumbnail share one top row; the footer row (byline + counts, share icon) sits below both', () => {
    const top = feed.indexOf('className="article-feed-top"')
    const copy = feed.indexOf('className="article-feed-copy"')
    const cover = feed.indexOf('className="article-feed-cover"')
    const row = feed.indexOf('className="article-feed-meta-row"')
    const share = feed.indexOf('<ArticleShareButton slug={a.slug}')
    expect(top).toBeGreaterThan(-1)
    expect(top).toBeLessThan(copy)
    expect(copy).toBeLessThan(cover)
    expect(cover).toBeLessThan(row)
    expect(row).toBeLessThan(share)
    // the share button is not inside the copy block or the top row
    expect(feed.slice(top, row)).not.toContain('ArticleShareButton')
  })

  it('the link is a column (top row, footer row); the share glyph lines up with the thumbnail edge', () => {
    expect(css).toMatch(/\.article-feed-link \{[^}]*flex-direction: column/)
    expect(css).toMatch(/\.article-feed-top \{[^}]*align-items: flex-start/)
    expect(css).toMatch(/\.article-feed-meta-row \{[^}]*justify-content: space-between/)
    expect(css).toMatch(/\.article-feed-share \{[^}]*margin: -8px -9px -8px 0/)
    expect(css).toMatch(/@media \(pointer: coarse\) \{ \.article-feed-share \{ margin-right: -13px; \} \}/)
  })

  it('the stretched hit link still opens the card; only the byline link and share button take clicks', () => {
    expect(css).toMatch(/\.article-feed-top, [^{]*\.article-feed-meta-row,[^{]*\{ position: relative; z-index: 0; pointer-events: none; \}/)
    expect(css).toMatch(/\.article-feed-copy a, \.article-feed-meta a, [^{]*\.article-feed-share \{ pointer-events: auto/)
  })
})
