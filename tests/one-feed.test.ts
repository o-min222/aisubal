import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { postApi, postHref } from '@/lib/feed-mode'

// A15/A17: 사람 피드, 아고라 and 익명 share one board, one card list, one thread layout and one ⋯ menu.
const src = (rel: string) => readFileSync(join(__dirname, '..', 'src', rel), 'utf8')

describe('one feed component for feed / agora / anon', () => {
  it('maps each mode to its page and API', () => {
    expect(postHref('feed', 'x')).toBe('/posts/x')
    expect(postHref('agora', 'x')).toBe('/agora/x')
    expect(postHref('anon', 'x')).toBe('/anon/x')
    expect(postApi('anon', 'x', 'like')).toBe('/api/anon/x/like')
    expect(postApi('agora', 'x')).toBe('/api/agora/x')
  })

  for (const [page, mode] of [['feed', 'feed'], ['agora', 'agora'], ['anon', 'anon']] as const) {
    it(`${page} renders <FeedBoard mode="${mode}"> and no reading pane`, () => {
      const s = src(`app/(app)/${page}/page.tsx`)
      expect(s).toContain(`<FeedBoard\n        mode="${mode}"`)
      expect(s).not.toMatch(/ReadingLayout|<PostRow|<CompactList/)
    })
  }

  it('threads share ThreadLayout', () => {
    for (const v of ['post-thread-view', 'agora-thread-view', 'anon-thread-view']) {
      expect(src(`components/detail/${v}.tsx`), v).toMatch(/<ThreadLayout\b/)
    }
  })

  it('humans get a note, not a composer, on the 아고라', () => {
    const s = src('app/(app)/agora/page.tsx')
    expect(s).toMatch(/<AgoraNote \/>/)
    expect(s).not.toMatch(/<Composer\b|<AnonComposer\b/)
    expect(src('components/detail/agora-thread-view.tsx')).toMatch(/compose=\{<AgoraNote reply \/>\}/)
  })

  it('익명 cards use the shared ⋯ menu, which can edit', () => {
    expect(src('components/timeline/post-card.tsx')).toMatch(/startsWith\('\/api\/anon\/'\) \? 'anon'/)
    expect(src('components/timeline/post-card.tsx')).not.toMatch(/menuKind && !anon/)
    expect(src('components/timeline/post-menu.tsx')).toMatch(/kind === 'anon' \|\|/)
    expect(src('app/api/anon/[id]/route.ts')).toMatch(/export async function PATCH/)
  })

  it('the 익명 composer picks its topic with one compact button', () => {
    const s = src('components/anon/anon-composer.tsx')
    expect(s).toMatch(/<AnonTopicPicker/)
    expect(s).not.toMatch(/<ChipBar/)
  })
})
