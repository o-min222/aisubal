import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyToggle, isValidReaction, normalizeShortcode, searchEmoji, sortSummary, THUMBS } from '@/lib/emoji-rules'
import { notificationSentence, type NotificationItem } from '@/lib/notifications'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'
const sql = readFileSync('supabase/migrations/0092_reactions_custom_emoji.sql', 'utf8')
const list = readFileSync('supabase/migrations/0094_reaction_notifications_list.sql', 'utf8')

// A39: Slack-style emoji reactions; 👍 stays the like.
describe('emoji reactions', () => {
  it('accepts emoji and :shortcodes:, rejects text and markup', () => {
    for (const ok of ['🎉', '❤️', '👩‍💻', '🇰🇷', ':party_parrot:', THUMBS]) expect(isValidReaction(ok)).toBe(true)
    for (const bad of ['lol', 'ㅋㅋ', '<b>', ':Party:', '', 'x'.repeat(40), ' 🎉']) expect(isValidReaction(bad)).toBe(false)
    expect(normalizeShortcode(':Party Parrot:')).toBe('party_parrot')
    expect(normalizeShortcode('a')).toBeNull()
  })

  it('keeps 👍 first, toggles optimistically, searches ko/en keywords and customs', () => {
    expect(sortSummary([{ emoji: '🎉', count: 5, mine: false }, { emoji: THUMBS, count: 1, mine: false }])[0].emoji).toBe(THUMBS)
    const a = applyToggle([], '🎉', true)
    expect(a).toEqual([{ emoji: '🎉', count: 1, mine: true }])
    expect(applyToggle(a, '🎉', false)).toEqual([])
    expect(applyToggle(a, '🎉', true)).toBe(a)
    expect(searchEmoji('축하', []).curated).toContain('🎉')
    expect(searchEmoji('fire', []).curated).toContain('🔥')
    expect(searchEmoji('par', [{ shortcode: 'party', url: 'x', mine: false }]).custom).toHaveLength(1)
  })

  it('migration: 👍 is the like, guards and counts reactions, batches notifications with likes', () => {
    expect(sql).toContain("emoji <> '👍'")
    expect(sql).toContain('engage_count integer generated always as (coalesce(like_count, 0) + coalesce(reaction_count, 0))')
    expect(sql).toMatch(/'like:' \|\| .*post_id/)
    expect(sql).toContain("bucket_id = 'emoji'")
    expect(list).toContain("when kind in ('like', 'agent_like', 'reaction')")
    const n = { kind: 'reaction', count: 3, actor: { kind: 'member', id: 'm', name: '망곰', avatarUrl: null } } as unknown as NotificationItem
    expect(notificationSentence(n)).toMatchObject({ name: '망곰', n: 2 })
  })

  it('real write path (dev): react, see who reacted, un-react; 👍 routes to likes; custom emoji upload + delete', async () => {
    const r1 = await fetch(`${BASE_URL}/api/feed/post-2/reactions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: '🚀' }) })
    expect(r1.status).toBe(200)
    expect((await r1.json()).reactions).toContainEqual({ emoji: '🚀', count: 1, mine: true })
    const who = await (await fetch(`${BASE_URL}/api/feed/post-2/reactions?emoji=${encodeURIComponent('🚀')}`)).json()
    expect(who.people).toHaveLength(1)
    const bad = await fetch(`${BASE_URL}/api/feed/post-2/reactions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: 'lol' }) })
    expect(bad.status).toBe(400)
    const thumbs = await (await fetch(`${BASE_URL}/api/feed/post-2/reactions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: THUMBS }) })).json()
    expect(thumbs.liked).toBe(true)
    await fetch(`${BASE_URL}/api/feed/post-2/reactions`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: THUMBS }) })
    const r2 = await (await fetch(`${BASE_URL}/api/feed/post-2/reactions`, { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: '🚀' }) })).json()
    expect(r2.reactions.find((r: { emoji: string }) => r.emoji === '🚀')).toBeUndefined()

    const code = `t${Date.now().toString(36)}`
    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'))
    const fd = new FormData()
    fd.set('shortcode', code)
    fd.set('file', new File([png], 'e.png', { type: 'image/png' }))
    const up = await fetch(`${BASE_URL}/api/emoji`, { method: 'POST', body: fd })
    expect(up.status).toBe(200)
    const react = await fetch(`${BASE_URL}/api/feed/post-2/reactions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ emoji: `:${code}:` }) })
    expect(react.status).toBe(200)
    const listed = await (await fetch(`${BASE_URL}/api/emoji`)).json()
    expect(listed.emojis.some((e: { shortcode: string; mine: boolean }) => e.shortcode === code && e.mine)).toBe(true)
    expect((await fetch(`${BASE_URL}/api/emoji/${code}`, { method: 'DELETE' })).status).toBe(200)
    const after = await (await fetch(`${BASE_URL}/api/feed/reactions?ids=post-2`)).json()
    expect(after.reactions['post-2'].some((r: { emoji: string }) => r.emoji === `:${code}:`)).toBe(false)
  })
})
