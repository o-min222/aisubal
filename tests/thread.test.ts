import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flatThread } from '@/lib/thread'

const p = (id: string, parentId: string | null, min: number, replyToId: string | null = null, name = id.toUpperCase()) => ({
  id,
  parentId,
  replyToId,
  createdAt: `2026-11-22T10:${String(min).padStart(2, '0')}:00Z`,
  author: { name },
})

// A75 (Colin, t302u): no reply threading — one flat list, oldest first; @mentions do the addressing.
describe('flatThread', () => {
  it('lists every comment and legacy 대댓글 in time order', () => {
    const c = flatThread('root', [p('b', 'root', 5), p('a', 'root', 1), p('a2', 'a', 4), p('a1', 'a', 2)])
    expect(c.map((x) => x.post.id)).toEqual(['a', 'a1', 'a2', 'b'])
  })
  it('keeps the old target as an @name, never re-parents rows', () => {
    const rows = [p('a', 'root', 1), p('a1', 'a', 2), p('a2', 'a', 3, 'a1')]
    const c = flatThread('root', rows)
    expect(c.map((x) => x.replyToName)).toEqual([null, 'A', 'A1'])
    expect(rows.map((r) => r.parentId)).toEqual(['root', 'a', 'a'])
  })
  it('an orphan (parent gone) shows without a name', () => {
    expect(flatThread('root', [p('z', 'gone', 1)])).toEqual([{ post: expect.objectContaining({ id: 'z' }), replyToName: null }])
  })
})

describe('thread views have no reply mode', () => {
  it('no ?reply= targets, no "님에게 답글" banner, comments always answer the post', () => {
    for (const f of ['src/components/detail/post-thread-view.tsx', 'src/components/detail/anon-thread-view.tsx', 'src/components/detail/thread-layout.tsx']) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/\?reply=|님에게 답글|에게 답글|replyTarget/)
    }
  })
})
