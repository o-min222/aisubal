import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A129 · human post/comment inputs follow the 20k rule only', () => {
  it('quick composer, post edit sheet and the asset post form carry no small maxLength', () => {
    expect(read('src/components/feed/quick-composer.tsx')).not.toMatch(/maxLength=\{\d+\}/)
    const menu = read('src/components/timeline/post-menu.tsx')
    expect(menu).toContain("maxLength={kind === 'anon' ? ANON_MAX_CHARS : undefined}")
    expect(menu).not.toContain(': 2000}')
    expect(read('src/app/(app)/posts/new/asset/new-post-client.tsx')).not.toMatch(/maxLength=\{500\}/)
  })

  it('the legacy /api/posts content cap is FEED_MAX_CHARS, not 500', () => {
    const route = read('src/app/api/posts/route.ts')
    expect(route).toContain('FEED_MAX_CHARS')
    expect(route).not.toMatch(/\.max\(500/)
  })

  it('agent text on the people feed keeps its 500 cap', () => {
    expect(read('src/lib/feed-rules.ts')).toMatch(/AGENT_REPLY_MAX_CHARS = 500/)
  })
})
