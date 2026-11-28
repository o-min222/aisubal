import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { canRestrict, composerVisibility, parseVisibility } from '@/lib/post-visibility'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'
const sql = readFileSync('supabase/migrations/0095_post_visibility.sql', 'utf8')

// A43: 공유범위 — 전체 회원 / 팔로워 / 친구만 / 나만 보기
describe('post visibility', () => {
  it('rules: only real-name root posts outside groups can be restricted; last choice is the default', () => {
    expect(canRestrict({ isReply: false })).toBe(true)
    expect(canRestrict({ isReply: true })).toBe(false)
    expect(canRestrict({ isReply: false, groupId: 'g' })).toBe(false)
    expect(canRestrict({ isReply: false, asGroup: true })).toBe(false)
    expect(canRestrict({ isReply: false, postedAs: 'nickname' })).toBe(false)
    expect(composerVisibility('friends')).toBe('friends')
    expect(composerVisibility(null)).toBe('members')
    expect(parseVisibility('public')).toBeNull()
  })

  it('migration enforces it in RLS, agent readers and notifications', () => {
    expect(sql).toMatch(/create policy posts_select[\s\S]*post__can_see\(author_id, visibility, current_member_id\(\)\)/)
    for (const fn of ['mcp_feed_get', 'mcp_feed_list', 'feed_agent_like', 'feed_agent_reply']) {
      const body = sql.slice(sql.indexOf(`FUNCTION public.${fn}(`))
      expect(body.slice(0, 3000)).toContain("visibility = 'members'")
    }
    expect(sql).toContain("new.visibility not in ('members', 'followers')")
    expect(sql).toContain('public.post__can_see(new.author_id, new.visibility, m.id)')
    expect(sql).toContain('public.post__can_see(s.author_id, s.visibility, v_me)')
    expect(sql).toContain('posts_visibility_kind_chk')
  })

  it('real write path (dev): post friends-only, read it back, change it, replies follow', async () => {
    const res = await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: `A43 vitest ${Date.now()}`, visibility: 'friends' }) })
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const page = await (await fetch(`${BASE_URL}/api/feed?scope=all`)).json()
    const mine = (page.posts ?? page.items ?? []).find((p: { id: string }) => p.id === id)
    if (mine) expect(mine.visibility).toBe('friends')
    const reply = await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'reply', parentId: id, visibility: 'members' }) })
    expect(reply.status).toBe(201)
    const patch = await fetch(`${BASE_URL}/api/feed/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'private' }) })
    expect(patch.status).toBe(200)
    expect((await patch.json()).visibility).toBe('private')
    const bad = await fetch(`${BASE_URL}/api/feed/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'everyone' }) })
    expect(bad.status).toBe(400)
    const other = await fetch(`${BASE_URL}/api/feed/post-1`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ visibility: 'private' }) })
    expect(other.status).toBe(403)
  })
})
