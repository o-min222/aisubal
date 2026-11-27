import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { flatThread, nestThread, normalizeReplyTarget, replyMentionPrefill, NESTED_PREVIEW } from '@/lib/thread'

const p = (id: string, parentId: string | null, min: number, replyToId: string | null = null, name = id.toUpperCase(), handle: string | null = null) => ({
  id,
  parentId,
  replyToId,
  createdAt: `2026-11-22T10:${String(min).padStart(2, '0')}:00Z`,
  author: { name, handle },
})

// A75: Agora / 익명 stay a flat chronological list.
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

describe('nestThread', () => {
  it('groups 대댓글 one indent under their parent comment, in time order', () => {
    const groups = nestThread('root', [p('b', 'root', 5), p('a', 'root', 1), p('a2', 'a', 4), p('a1', 'a', 2)])
    expect(groups.map((g) => g.post.id)).toEqual(['a', 'b'])
    expect(groups[0].children.map((c) => c.post.id)).toEqual(['a1', 'a2'])
    expect(groups[1].children).toEqual([])
  })
  it('flattens a reply-to-reply under the same comment and shows @name only then', () => {
    const groups = nestThread('root', [p('a', 'root', 1), p('a1', 'a', 2), p('a2', 'a', 3, 'a1')])
    expect(groups).toHaveLength(1)
    expect(groups[0].children.map((c) => [c.post.id, c.replyToName])).toEqual([['a1', null], ['a2', 'A1']])
  })
  it('an orphan (parent gone) stays a top-level row', () => {
    const groups = nestThread('root', [p('z', 'gone', 1)])
    expect(groups.map((g) => g.post.id)).toEqual(['z'])
    expect(groups[0].children).toEqual([])
  })
  it('lifts a deeper parent_id (not yet flattened) under the first-level comment', () => {
    const groups = nestThread('root', [p('a', 'root', 1), p('a1', 'a', 2), p('a3', 'a1', 3)])
    expect(groups).toHaveLength(1)
    expect(groups[0].children.map((c) => c.post.id)).toEqual(['a1', 'a3'])
  })
})

describe('normalizeReplyTarget / replyMentionPrefill', () => {
  it('comments on the post stay depth 1 with no reply_to', () => {
    expect(normalizeReplyTarget({ id: 'root', parentId: null, rootId: null })).toEqual({
      parentId: 'root',
      rootId: 'root',
      replyToId: null,
    })
  })
  it('a 답글 on a comment parents that comment and remembers it as reply_to', () => {
    expect(normalizeReplyTarget({ id: 'a', parentId: 'root', rootId: 'root' })).toEqual({
      parentId: 'a',
      rootId: 'root',
      replyToId: 'a',
    })
  })
  it('a 답글 on a nested reply flattens under the comment', () => {
    expect(normalizeReplyTarget({ id: 'a1', parentId: 'a', rootId: 'root' })).toEqual({
      parentId: 'a',
      rootId: 'root',
      replyToId: 'a1',
    })
  })
  it('prefills @handle only when answering a nested reply', () => {
    expect(replyMentionPrefill({ parentId: 'root', author: { handle: 'prompt_jar' } }, 'root')).toBe('')
    expect(replyMentionPrefill({ parentId: 'a', author: { handle: 'prompt_jar' } }, 'root')).toBe('@prompt_jar ')
    expect(replyMentionPrefill({ parentId: 'a', author: { handle: null } }, 'root')).toBe('')
  })
  it('keeps the preview cap at 3', () => {
    expect(NESTED_PREVIEW).toBe(3)
  })
})

describe('thread views', () => {
  it('익명 stays a flat list with no 대댓글 composer', () => {
    const src = readFileSync(join(__dirname, '..', 'src/components/detail/anon-thread-view.tsx'), 'utf8')
    expect(src).not.toMatch(/\?reply=|님에게 답글|에게 답글|commentReply|FeedCommentThread|onReply/)
  })
  it('아고라 stays a flat list with no 대댓글 composer', () => {
    const src = readFileSync(join(__dirname, '..', 'src/components/detail/agora-thread-view.tsx'), 'utf8')
    expect(src).not.toMatch(/\?reply=|님에게 답글|commentReply|FeedCommentThread|onReply/)
  })
  it('the feed thread wires a 답글 action and nested list', () => {
    const view = readFileSync(join(__dirname, '..', 'src/components/detail/post-thread-view.tsx'), 'utf8')
    const layout = readFileSync(join(__dirname, '..', 'src/components/detail/thread-layout.tsx'), 'utf8')
    const nest = readFileSync(join(__dirname, '..', 'src/components/comments/feed-comment-thread.tsx'), 'utf8')
    expect(view).toMatch(/commentReply/)
    expect(layout).toMatch(/FeedCommentThread/)
    expect(nest).toMatch(/답글/)
    expect(nest).toMatch(/답글 \{count\}개 더 보기/)
    expect(nest).toMatch(/replyMentionPrefill/)
  })
})
