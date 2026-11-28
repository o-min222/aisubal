import { beforeEach, describe, expect, it, vi } from 'vitest'

// Runs the REAL (non-mock) Supabase branch of the feed / thread loaders against an in-memory fake client,
// so refactors of query order (A20: parallel queries) are pinned by output, not just by the mock-data branch.
type Row = Record<string, unknown>
const T = (n: number) => new Date(Date.UTC(2026, 10, 20, 0, n)).toISOString()
const member = (id: string, name: string) => ({ id, display_name: name, handle: name.toLowerCase(), avatar_url: null })
function post(id: string, o: Partial<Row> = {}): Row {
  return {
    id, parent_id: null, reply_to_id: null, root_id: null, title: '', content: `body ${id}`, url: null, link_title: null, link_description: null,
    link_image: null, link_site_name: null, link_favicon: null, link_type: null, link_previews: null, posted_as: 'real', author_kind: 'member',
    agent_name: null, agent_model: null, agent_token_id: null, agent_interaction: 'humans_only', like_count: 1, reply_count: 0, is_hidden: false,
    created_at: T(0), group_id: null, deleted_at: null, edited_at: null, public_author_id: 'm-other', author: member('m-other', 'Other'), nick: null,
    as_group_id: null, grp: null, onboarding_test: false, ...o,
  }
}
const ROWS: Row[] = [
  post('p-root', { created_at: T(10), reply_count: 2 }),
  post('p-r1', { parent_id: 'p-root', root_id: 'p-root', reply_to_id: 'p-root', created_at: T(11), public_author_id: 'me', author: member('me', 'Me') }),
  post('p-r2', { parent_id: 'p-r1', root_id: 'p-root', reply_to_id: 'p-r1', created_at: T(12) }),
  post('p-group', { created_at: T(9), posted_as: 'group', as_group_id: 'g1', public_author_id: null, author: null, grp: { id: 'g1', slug: 'club', name: 'Club' } }),
  post('p-mine', { created_at: T(8), public_author_id: 'me', author: member('me', 'Me') }),
  post('p-hidden', { created_at: T(7), is_hidden: true }),
]
const LIKES = [{ post_id: 'p-root', member_id: 'me', liker_type: 'member' }, { post_id: 'p-r2', member_id: 'me', liker_type: 'member' }]
const calls: string[] = []

class Q {
  private f: Array<(r: Row) => boolean> = []
  private sort: [string, boolean] | null = null
  private lim = Infinity
  private off = 0
  private single = false
  private counted = false
  constructor(private rows: Row[]) {}
  select(_c?: string, o?: { count?: string }) { this.counted = Boolean(o?.count); return this }
  eq(c: string, v: unknown) { this.f.push((r) => r[c] === v); return this }
  is(c: string, v: unknown) { this.f.push((r) => (r[c] ?? null) === v); return this }
  in(c: string, v: unknown[]) { this.f.push((r) => v.includes(r[c])); return this }
  lt(c: string, v: string) { this.f.push((r) => String(r[c]) < v); return this }
  gte(c: string, v: string) { this.f.push((r) => String(r[c]) >= v); return this }
  or() { return this }
  order(c: string, o?: { ascending?: boolean }) { this.sort ??= [c, o?.ascending ?? true]; return this }
  limit(n: number) { this.lim = n; return this }
  range(a: number, b: number) { this.off = a; this.lim = b - a + 1; return this }
  maybeSingle() { this.single = true; return this }
  then<A>(res: (v: { data: unknown; error: null; count: number | null }) => A) {
    let out = this.rows.filter((r) => this.f.every((fn) => fn(r)))
    const count = out.length
    if (this.sort) { const [c, asc] = this.sort; out = [...out].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (asc ? 1 : -1)) }
    out = out.slice(this.off, this.off + this.lim)
    return Promise.resolve({ data: this.single ? (out[0] ?? null) : out, error: null, count: this.counted ? count : null }).then(res)
  }
}
const fake = {
  from: (t: string) => { calls.push(`from:${t}`); return new Q(t === 'posts' ? ROWS : t === 'post_likes' ? LIKES : []) },
  rpc: async (fn: string, args: { p_ids?: string[] }) => {
    calls.push(`rpc:${fn}`)
    if (fn === 'posts_mine') return { data: (args.p_ids ?? []).filter((id) => id === 'p-group'), error: null }
    if (fn === 'group_post_authors') return { data: { 'p-group': { id: 'me', name: 'Me', handle: 'me' } }, error: null }
    return { data: null, error: null }
  },
}
vi.mock('@/lib/data/client', () => ({ isMock: () => false, sb: async () => fake }))
vi.mock('@/lib/data/nickname', () => ({ myNicknameId: async () => null }))
vi.mock('@/lib/data/agent-profiles', () => ({ withAgentCards: async (p: unknown) => p, withAgentLikerCards: async (p: unknown) => p }))
vi.mock('@/lib/data/rec-dismissals', () => ({ listDismissed: async () => null }))
vi.mock('@/lib/data/social', () => ({
  socialAuthorIds: async () => [],
  getRelations: async (_v: string, ids: string[]) => new Map(ids.map((id) => [id, { isMe: id === 'me', iFollow: id === 'm-other', followsMe: false, isFriend: false }])),
}))

const { getFeedThread, listFeedPage } = await import('@/lib/data/feed')

describe('feed loaders, real Supabase branch', () => {
  beforeEach(() => { calls.length = 0 })
  it('thread opened at its root', async () => {
    expect(await getFeedThread('p-root', 'me')).toMatchSnapshot()
  })
  it('thread opened at a reply resolves the same root and replies', async () => {
    expect(await getFeedThread('p-r2', 'me')).toEqual(await getFeedThread('p-root', 'me'))
  })
  it('group-identity thread gets isMine and the writer', async () => {
    const t = await getFeedThread('p-group', 'me')
    expect(t).toMatchSnapshot()
    expect(t?.isMine).toBe(true)
  })
  it('feed page: likes, follow chips and group identity together', async () => {
    expect(await listFeedPage('me', { scope: 'all', page: 1 })).toMatchSnapshot()
  })
})
