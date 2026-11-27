import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A117 · mention accent color', () => {
  it('mentions use the design-system blue, not inherited body text', () => {
    const css = read('src/app/globals.css')
    expect(css).toMatch(/a\.mention\.body-link[^{]*\{[^}]*color:\s*var\(--c-06c\)/)
    expect(css).toContain('.mention, a.mention')
  })

  it('mentions stay colored on the feed, thread, notifications, articles, and comment previews', () => {
    expect(read('src/components/timeline/mention-text.tsx')).toContain('className={`mention body-link')
    expect(read('src/components/timeline/mention-text.tsx')).toContain('link = true')
    expect(read('src/components/timeline/comment-previews.tsx')).toContain('link={false}')
    expect(read('src/components/notifications/notification-row.tsx')).toContain('<MentionText text={n.excerpt} link={false} />')
    expect(read('src/components/articles/article-markdown.tsx')).toContain('withMentions')
    expect(read('src/components/articles/article-comments.tsx')).toContain('<MentionText text={c.body ?? \'\'} />')
  })
})
