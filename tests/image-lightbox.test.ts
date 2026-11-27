import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A115 · view-only image lightbox on a thread', () => {
  it('opens from the thread cards only, and deters download', () => {
    const c = read('src/components/timeline/image-lightbox.tsx')
    expect(c).toContain("aria-label={tx('이미지 크게 보기')}")
    expect(c).toContain("aria-label={tx('이미지 보기 닫기')}")
    expect(c).toContain("e.key === 'Escape'")
    expect(c).toContain('draggable={false}')
    expect(c).toContain('onContextMenu={blockMenu}')
    expect(c).not.toMatch(/download/)
    const css = read('src/app/globals.css')
    expect(css).toContain('-webkit-touch-callout: none')
    expect(css).toContain('user-select: none')
    const card = read('src/components/timeline/post-card.tsx')
    expect(card).toContain('expandImage')
    expect(card).toContain('ExpandableImage')
    const thread = read('src/components/detail/thread-layout.tsx')
    expect(thread.match(/expandImage/g)?.length).toBeGreaterThanOrEqual(2)
    const feed = read('src/components/feed/feed-timeline.tsx')
    expect(feed).not.toContain('expandImage')
  })
})
