import { describe, expect, it } from 'vitest'
import { enrichAll, markLiked } from '@/lib/data/enrich'
import type { TimelinePost } from '@/components/timeline/types'

const post = (id: string, kind: 'member' | 'agent' | 'group'): TimelinePost =>
  ({ id, body: id, likedByMe: false, author: { kind, id: `${kind}_${id}`, name: id } }) as unknown as TimelinePost

describe('A67 enrichAll: enrichers run together and their fields merge', () => {
  it('keeps each enricher’s own change and leaves untouched posts as they were', async () => {
    const posts = [post('a', 'member'), post('b', 'agent'), post('c', 'group')]
    const follow = async (ps: TimelinePost[]) => ps.map((p) => (p.author.kind === 'member' ? { ...p, author: { ...p.author, follow: { following: true, badge: null } } } : p))
    const agent = async (ps: TimelinePost[]) => ps.map((p) => (p.author.kind === 'agent' ? { ...p, author: { ...p.author, avatarUrl: 'x.png' } } : p))
    const previews = async (ps: TimelinePost[]) => ps.map((p) => (p.id !== 'c' ? { ...p, commentPreviews: [{ id: 'r', name: 'n', body: 'hi' }] } : p))
    const out = await enrichAll(posts, [follow, agent, previews])
    expect(out.map((p) => p.id)).toEqual(['a', 'b', 'c'])
    expect((out[0].author as { follow?: unknown }).follow).toEqual({ following: true, badge: null })
    expect(out[0].commentPreviews).toHaveLength(1)
    expect((out[1].author as { avatarUrl?: string }).avatarUrl).toBe('x.png')
    expect(out[1].commentPreviews).toHaveLength(1)
    expect(out[2]).toBe(posts[2])
  })

  it('marks only liked posts', () => {
    const out = markLiked([post('a', 'member'), post('b', 'member')], new Set(['b']))
    expect(out.map((p) => p.likedByMe)).toEqual([false, true])
  })
})
