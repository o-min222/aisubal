import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { canRepost, mergePostsWithReposts, repostActivityAt, repostLabel } from '@/lib/repost-rules'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'

const read = (p: string) => readFileSync(p, 'utf8')
const base = { parentId: null, groupId: null, isNickname: false, visibility: 'members' as const, isDeleted: false, isHidden: false, isMine: false, author: { kind: 'member' as const } }

describe('A95 · repost rules', () => {
  it('only a plain, public, real-name root post by someone else can be reposted', () => {
    expect(canRepost(base)).toBe(true)
    expect(canRepost({ ...base, author: { kind: 'agent' } })).toBe(true)
    expect(canRepost({ ...base, visibility: undefined })).toBe(true)
    for (const v of ['followers', 'friends', 'private'] as const) expect(canRepost({ ...base, visibility: v })).toBe(false)
    expect(canRepost({ ...base, parentId: 'p1' })).toBe(false)
    expect(canRepost({ ...base, groupId: 'g1' })).toBe(false)
    expect(canRepost({ ...base, isNickname: true })).toBe(false)
    expect(canRepost({ ...base, isDeleted: true })).toBe(false)
    expect(canRepost({ ...base, isHidden: true })).toBe(false)
    expect(canRepost({ ...base, isMine: true })).toBe(false)
    expect(canRepost({ ...base, author: { kind: 'group' } })).toBe(false)
    expect(canRepost({ ...base, author: { kind: 'anon' } })).toBe(false)
  })

  it('the count is hidden at 0 and capped', () => {
    expect(repostLabel(0)).toBeNull()
    expect(repostLabel(3)).toBe('3')
    expect(repostLabel(1200)).toBe('999+')
  })

  it('the bell says who reposted', () => {
    const n: NotificationItem = { id: 'n', kind: 'repost', category: 'likes', link: '/posts/p1', excerpt: 'x', targetKind: 'post', count: 1, createdAt: '', unread: true, actor: { kind: 'member', id: 'm', name: '지우', avatarUrl: null } }
    expect(notificationSentence(n)).toMatchObject({ s: '{name}님이 내 글을 리포스트했어요', name: '지우' })
  })
})

describe('A95 · 0128 migration', () => {
  const SQL = read('supabase/migrations/0128_reposts.sql')
  it('guards what is repostable, in the database', () => {
    expect(SQL).toMatch(/p\.parent_id is not null or p\.group_id is not null or p\.as_group_id is not null/)
    expect(SQL).toMatch(/p\.posted_as <> 'real' or p\.is_hidden or p\.deleted_at is not null/)
    expect(SQL).toMatch(/coalesce\(p\.visibility, 'members'\) <> 'members' or p\.author_id = new\.member_id/)
    expect(SQL).toContain("errcode = 'P0001'")
  })
  it('RLS on, own rows only, nothing for anon, helpers not callable', () => {
    expect(SQL).toContain('alter table public.post_reposts enable row level security')
    expect(SQL).toContain('revoke all on public.post_reposts from public, anon, authenticated')
    expect(SQL).toContain('grant select, insert, delete on public.post_reposts to authenticated')
    expect(SQL).toMatch(/with check \(member_id = \(select public\.current_member_id\(\)\)/)
    expect(SQL).toMatch(/using \(member_id = \(select public\.current_member_id\(\)\)\)/)
    expect(SQL).not.toMatch(/grant [^;]*to[^;]*\banon\b/)
    for (const f of ['post_reposts__guard()', 'post_reposts__count()', 'notify__post_repost()']) expect(SQL).toContain(`revoke all on function public.${f} from public, anon, authenticated`)
    expect(SQL).toContain('grant select (repost_count) on public.posts to authenticated')
  })
  it('notifies the author once per (post, reposter) and takes it back on undo', () => {
    expect(SQL).toMatch(/'digest_nudge','question','repost'\]\)\)/)
    expect(SQL).toContain("'repost:' || p.id || ':' || new.member_id")
    expect(SQL).toContain("delete from public.notifications where kind = 'repost' and dedupe_key = 'repost:' || old.post_id || ':' || old.member_id")
    // source_id is the post so notifications_list keeps checking the viewer may still see it
    expect(SQL).toMatch(/'post', p\.id, p\.id,/)
  })
})

describe('A95 · surfaces', () => {
  it('the feed reads repost_count and carries reposts in 팔로잉 / 친구 and on a member profile', () => {
    const f = read('src/lib/data/feed.ts')
    expect(f).toContain('reaction_count, repost_count, is_question, visibility')
    expect(f).toMatch(/\(scope === 'following' \|\| scope === 'friends'\) && !opts\.groupId && !opts\.authorId && !opts\.q/)
    expect(f).toContain('Boolean(opts.authorId) && !opts.groupId && !opts.q')
    expect(f).toContain('mergePostsWithReposts')
    // the post is read under its own RLS and only plain real-name root posts qualify
    expect(f).toMatch(/\.is\('parent_id', null\)\s*\.is\('group_id', null\)\s*\.eq\('posted_as', 'real'\)\s*\.eq\('is_hidden', false\)\s*\.is\('deleted_at', null\)/)
    expect(f).not.toContain('skipAuthors')
  })
  it('POST/DELETE /api/feed/{id}/repost', () => {
    const r = read('src/app/api/feed/[id]/repost/route.ts')
    expect(r).toContain('export async function POST')
    expect(r).toContain('export async function DELETE')
    expect(r).toContain("'repost_not_allowed'")
  })
  it('the action row is one compact left group: reaction · comment · repost · share · save; no fixed-width slots', () => {
    const c = read('src/components/timeline/post-card.tsx')
    const foot = c.slice(c.indexOf('<footer'), c.indexOf('</footer>'))
    const order = ['<ReactionAddButton', '<MessageCircle', '<RepostButton', '<Share2', '<ArchiveButton']
    const at = order.map((k) => foot.indexOf(k))
    expect(at.every((i) => i > 0)).toBe(true)
    expect([...at].sort((a, b) => a - b)).toEqual(at)
    expect(c).toContain('post.repostedBy')
    const css = read('src/app/globals.css')
    expect(css).not.toMatch(/\.tc-slot \{[^}]*min-width/)
    expect(css).not.toMatch(/@media \(min-width: 640px\) \{ \.tc-slot/)
  })
})

describe('A113 · repost surfaces', () => {
  it('a repost on the same page replaces the original and sorts by repost time', () => {
    type Row = { id: string; createdAt: string; repostedBy?: { at: string } | null }
    const original: Row = { id: 'p1', createdAt: '2026-11-01T00:00:00Z', repostedBy: null }
    const older: Row = { id: 'p0', createdAt: '2026-10-01T00:00:00Z', repostedBy: null }
    const newer: Row = { id: 'p2', createdAt: '2026-11-20T00:00:00Z', repostedBy: null }
    const repost: Row = { id: 'p1', createdAt: '2026-11-01T00:00:00Z', repostedBy: { at: '2026-11-27T00:00:00Z' } }
    const onlyRepost: Row = { id: 'p9', createdAt: '2026-01-01T00:00:00Z', repostedBy: { at: '2026-11-26T12:00:00Z' } }
    const merged = mergePostsWithReposts([newer, original, older], [repost, onlyRepost])
    expect(merged.map((p) => p.id)).toEqual(['p1', 'p9', 'p2', 'p0'])
    expect(merged[0].repostedBy?.at).toBe('2026-11-27T00:00:00Z')
    expect(merged.filter((p) => p.id === 'p1')).toHaveLength(1)
    expect(repostActivityAt(repost)).toBe('2026-11-27T00:00:00Z')
    expect(repostActivityAt(older)).toBe('2026-10-01T00:00:00Z')
  })

  it('the toast links to the profile, and the dashboard marks a mixed-in repost', () => {
    const b = read('src/components/timeline/repost-button.tsx')
    expect(b).toContain("tn('내 프로필에 리포스트했어요')")
    expect(b).toContain("tn('프로필 보기')")
    expect(b).toContain("router.push('/members/me')")
    const me = read('src/app/(app)/me/page.tsx')
    expect(me).toContain('<T>리포스트함</T>')
    expect(me).toContain('p.repostedBy?.at ?? p.createdAt')
    expect(me).toContain('reposted: Boolean(p.repostedBy)')
    const t = read('src/i18n/dict/en.ts')
    expect(t).toContain('"내 프로필에 리포스트했어요": "Reposted to your profile"')
    expect(t).toContain('"리포스트함": "Reposted"')
  })
})
