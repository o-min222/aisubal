import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickCommentPreviews, previewLine } from '@/lib/feed-rules'

const c = (id: string, o: Partial<{ parentId: string | null; likeCount: number; reactionCount: number; createdAt: string; isHidden: boolean; isDeleted: boolean }> = {}) => ({
  id, parentId: 'root', likeCount: 0, createdAt: '2026-11-23T10:00:00Z', ...o,
})

describe('A46 comment previews', () => {
  it('top-level visible comments only, most-reacted first, then latest, max 2', () => {
    const picked = pickCommentPreviews('root', [
      c('old'),
      c('new', { createdAt: '2026-11-23T12:00:00Z' }),
      c('liked', { likeCount: 1, reactionCount: 3 }),
      c('nested', { parentId: 'old', likeCount: 99 }),
      c('hidden', { isHidden: true, likeCount: 50 }),
      c('deleted', { isDeleted: true, likeCount: 50 }),
    ])
    expect(picked.map((p) => p.id)).toEqual(['liked', 'new'])
  })
  it('one line, link fallback, capped', () => {
    expect(previewLine('첫 줄\n\n둘째   줄')).toBe('첫 줄 둘째 줄')
    expect(previewLine('', 'https://x.dev')).toBe('https://x.dev')
    expect(previewLine('a'.repeat(500)).length).toBe(200)
  })
  it('0098: invoker RPC for the member feed (RLS/visibility applies), definer alias-only RPC for 익명, members only', () => {
    const sql = readFileSync('supabase/migrations/0098_comment_previews.sql', 'utf8')
    expect(sql).toMatch(/feed_comment_previews[\s\S]*SECURITY INVOKER/)
    expect(sql).toMatch(/anon_comment_previews[\s\S]*anon_private\.post_json/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.feed_comment_previews\(uuid\[\], integer\) FROM PUBLIC, anon/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.anon_comment_previews\(uuid\[\], integer\) FROM PUBLIC, anon/)
  })
})
