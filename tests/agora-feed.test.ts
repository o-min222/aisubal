import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { stripPreviewedUrls } from '@/lib/link-strip'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const sql = readFileSync('supabase/migrations/0102_agora_reactions.sql', 'utf8')
const AGORA_ID = '00000000-0000-4000-8000-00000000a001'
const json = (emoji: string) => ({ headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji }) })

// A60: the 아고라 reads like the people feed — same filter, reactions, comment previews, URL strip.
describe('A60 AI-side feed', () => {
  it('page: no tab bar, the shared ?f= filter (old ?tab= still parsed), no per-row admin icon', () => {
    const page = readFileSync('src/app/(app)/agora/page.tsx', 'utf8')
    expect(page).not.toMatch(/LinkTabs/)
    expect(page).toMatch(/<FeedFilter /)
    expect(page).toMatch(/parseAgoraTab\(sp\.f \?\? sp\.tab\)/)
    expect(readFileSync('src/components/feed/feed-timeline.tsx', 'utf8')).not.toMatch(/AgoraPostActions/)
  })

  it('migration: member-only reactions with guards, counter, owner notification, INVOKER previews', () => {
    expect(sql).toContain("emoji <> '👍'")
    expect(sql).toMatch(/with check \(member_id = \(select public\.current_member_id\(\)\)/)
    expect(sql).toContain('revoke all on public.agora_reactions from public, anon, authenticated')
    expect(sql).toMatch(/agora_comment_previews[\s\S]*security invoker/)
    expect(sql).toMatch(/revoke all on function public\.agora_comment_previews\(uuid\[\], integer\) from public, anon/)
    expect(sql).toContain("'agents', 'member'")
  })

  it('agent posts drop a bare URL that shows as a live card', () => {
    expect(stripPreviewedUrls('써봤어요\nhttps://github.com/upstash/context7', ['https://github.com/upstash/context7'])).toBe('써봤어요')
  })

  it('real write path (dev): react on an agora post, list it, un-react; 👍 routes to agora likes', async () => {
    const r1 = await fetch(`${BASE_URL}/api/agora/${AGORA_ID}/reactions`, { method: 'POST', ...json('🚀') })
    expect(r1.status).toBe(200)
    expect((await r1.json()).reactions).toEqual(expect.arrayContaining([expect.objectContaining({ emoji: '🚀', mine: true })]))
    const list = await (await fetch(`${BASE_URL}/api/agora/reactions?ids=${AGORA_ID},not-a-uuid`)).json()
    expect(Object.keys(list.reactions)).toEqual([AGORA_ID])
    const who = await (await fetch(`${BASE_URL}/api/agora/${AGORA_ID}/reactions?emoji=${encodeURIComponent('🚀')}`)).json()
    expect(who.people.length).toBeGreaterThan(0)
    const thumbs = await (await fetch(`${BASE_URL}/api/agora/${AGORA_ID}/reactions`, { method: 'POST', ...json('👍') })).json()
    expect(thumbs.liked).toBe(true)
    await fetch(`${BASE_URL}/api/agora/${AGORA_ID}/reactions`, { method: 'DELETE', ...json('👍') })
    const r2 = await (await fetch(`${BASE_URL}/api/agora/${AGORA_ID}/reactions`, { method: 'DELETE', ...json('🚀') })).json()
    expect(r2.reactions.some((r: { emoji: string }) => r.emoji === '🚀')).toBe(false)
    expect((await fetch(`${BASE_URL}/api/agora/${AGORA_ID}/reactions`, { method: 'POST', ...json('lol') })).status).toBe(400)
  })
})
