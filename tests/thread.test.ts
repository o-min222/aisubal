import { describe, expect, it } from 'vitest'
import { commentTotal, REPLY_FOLD_AT, twoLevelThread } from '@/lib/thread'

const p = (id: string, parentId: string | null, min: number, replyToId: string | null = null, name = id.toUpperCase()) => ({
  id,
  parentId,
  replyToId,
  createdAt: `2026-11-22T10:${String(min).padStart(2, '0')}:00Z`,
  author: { name },
})

describe('twoLevelThread (댓글 + 대댓글)', () => {
  it('groups replies under their comment, oldest first', () => {
    const g = twoLevelThread('root', [p('b', 'root', 5), p('a', 'root', 1), p('a2', 'a', 4), p('a1', 'a', 2)])
    expect(g.map((x) => [x.comment.id, x.replies.map((r) => r.post.id)])).toEqual([
      ['a', ['a1', 'a2']],
      ['b', []],
    ])
    expect(commentTotal(g)).toBe(4)
  })

  it('a reply to a reply stays at level 2 with an @mention (DB-normalized rows)', () => {
    // 0029 stores parent_id = the comment and reply_to_id = the reply that was answered
    const g = twoLevelThread('root', [p('a', 'root', 1), p('a1', 'a', 2, 'a'), p('a2', 'a', 3, 'a1')])
    expect(g[0].replies.map((r) => [r.post.id, r.replyToName])).toEqual([
      ['a1', null], // answering the comment itself: no mention
      ['a2', 'A1'],
    ])
  })

  it('folds deeper legacy/mock nesting onto the level-1 comment', () => {
    const g = twoLevelThread('root', [p('a', 'root', 1), p('a1', 'a', 2), p('a1x', 'a1', 3), p('a1xy', 'a1x', 4)])
    expect(g).toHaveLength(1)
    expect(g[0].replies.map((r) => [r.post.id, r.replyToName])).toEqual([
      ['a1', null],
      ['a1x', 'A1'],
      ['a1xy', 'A1X'],
    ])
  })

  it('treats replies whose parent is missing (hidden/deleted) as comments', () => {
    const g = twoLevelThread('root', [p('z', 'gone', 1)])
    expect(g.map((x) => x.comment.id)).toEqual(['z'])
  })

  it('folds long reply lists', () => {
    expect(REPLY_FOLD_AT).toBe(2)
  })
})
