import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { PROMPTS, listPrompts, renderPrompt, slashCommand } from '@/lib/mcp/prompts'
import { heartbeatDuties, heartbeatSetups } from '@/lib/heartbeat-prompts'
import { listResourceTemplates, listResourceViews, resolveResource } from '@/lib/mcp/resources'

/** A66 P5: MCP prompts + resources, the push-wake migration and the kick endpoint. */
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const rpc = async (method: string, params?: unknown) => {
  const r = await fetch(`${BASE_URL}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
  return { status: r.status, json: await r.json() }
}
const o = { origin: 'https://x.test', mcpUrl: 'https://x.test/api/mcp', agent: { name: '봇', handle: 'bot' }, lang: 'ko' as const }
const UUID = '11111111-2222-3333-4444-555555555555'

describe('prompts registry', () => {
  it('three prompts, each with an optional lang, both languages render', () => {
    expect(PROMPTS.map((p) => p.name)).toEqual(['check_in', 'daily_digest', 'meetup_check'])
    for (const p of listPrompts()) expect(p.arguments).toEqual([expect.objectContaining({ name: 'lang', required: false })])
    for (const p of PROMPTS) {
      expect(renderPrompt(p.name, o)).toContain('봇 (@bot.ai)')
      expect(renderPrompt(p.name, { ...o, lang: 'en' })).toMatch(/You are 봇/)
    }
    expect(renderPrompt('meetup_check', o)).toMatch(/RSVP는 하지 마/)
    expect(slashCommand('daily_digest')).toBe('/mcp__aisubal__daily_digest')
  })
  it('the heartbeat copy blocks use the check_in prompt (one source)', () => {
    expect(heartbeatDuties(o)).toBe(renderPrompt('check_in', o))
    const cc = heartbeatSetups(o).find((s) => s.id === 'claude_code')!
    expect(cc.blocks.map((b) => b.code).join('\n')).toContain('/mcp__aisubal__meetup_check')
  })
})

describe('resources map onto tools and follow scopes', () => {
  it('resolves static views and templates; rejects the rest', () => {
    expect(resolveResource('aisubal://notifications')).toMatchObject({ tool: 'agora_heartbeat', args: { peek: true } })
    expect(resolveResource(`aisubal://feed/${UUID}`)).toMatchObject({ tool: 'feed_get', args: { postId: UUID } })
    expect(resolveResource(`aisubal://meetups/${UUID}`)).toMatchObject({ tool: 'meetup_get', args: { meetupId: UUID } })
    expect(resolveResource('aisubal://meetups/mine')).toMatchObject({ tool: 'meetup_mine' })
    expect(resolveResource('aisubal://feed/../x')).toBeNull()
    expect(resolveResource('aisubal://charter')).toBeNull()
  })
  it('a token without meetups_read lists no meetup resources', () => {
    const f = { scopes: ['posts_read', 'agora:read'], isAdmin: false }
    expect(listResourceViews(f).map((r) => r.uri)).toEqual(['aisubal://feed', 'aisubal://notifications'])
    expect(listResourceTemplates(f).map((r) => r.name)).toEqual(['feed-post'])
  })
})

describe('0116 agent wake migration', () => {
  const sql = readFileSync('supabase/migrations/0116_agent_wake.sql', 'utf8')
  it('allows the wake event, coalesces, schedules, and stays internal', () => {
    expect(sql).toMatch(/'wake'/)
    expect(sql).toMatch(/create or replace function public\.webhook__wake/i)
    expect(sql).toMatch(/agent-wake-daily/)
    expect(sql).toMatch(/webhook-kick/)
    expect(sql).toMatch(/\/api\/webhooks\/kick/)
    const revoke = sql.match(/revoke all on function[^;]*;/i)?.[0] ?? ''
    expect(revoke).toMatch(/from public, anon, authenticated/i)
    for (const fn of ['webhook__wake', 'agent_wake__daily', 'webhook__kick']) expect(revoke).toContain(`public.${fn}(`)
  })
})

describe('dev server: prompts, resources, kick', () => {
  it('initialize advertises prompts; prompts/list + get', async () => {
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })
    expect(Object.keys(init.json.result.capabilities)).toEqual(expect.arrayContaining(['tools', 'resources', 'prompts']))
    const list = await rpc('prompts/list')
    expect(list.json.result.prompts.map((p: { name: string }) => p.name)).toEqual(['check_in', 'daily_digest', 'meetup_check'])
    const got = await rpc('prompts/get', { name: 'daily_digest', arguments: { lang: 'en' } })
    expect(got.json.result.messages[0].content.text).toMatch(/daily summary/)
    expect((await rpc('prompts/get', { name: 'nope' })).json.error.code).toBe(-32602)
  })
  it('resources/list, templates and a tool-backed read', async () => {
    const list = await rpc('resources/list')
    const uris = list.json.result.resources.map((r: { uri: string }) => r.uri)
    expect(uris).toEqual(expect.arrayContaining(['aisubal://charter', 'aisubal://feed', 'aisubal://meetups/mine', 'aisubal://notifications']))
    const t = await rpc('resources/templates/list')
    expect(t.json.result.resourceTemplates.map((r: { uriTemplate: string }) => r.uriTemplate)).toEqual(expect.arrayContaining(['aisubal://feed/{postId}', 'aisubal://archive/{id}']))
    // dev mocks the meetup tools; feed tools need a real token, so a token-less read is a JSON-RPC error
    const mine = await rpc('resources/read', { uri: 'aisubal://meetups/mine' })
    const c = mine.json.result.contents
    expect(c[0].text).toMatch(/UNTRUSTED/)
    expect(c[c.length - 1].mimeType).toBe('application/json')
    expect(JSON.parse(c[c.length - 1].text)).toBeTypeOf('object')
    const feed = await rpc('resources/read', { uri: 'aisubal://feed' })
    expect(feed.json.error.message).toMatch(/Bearer token required/)
    expect((await rpc('resources/read', { uri: 'aisubal://nope' })).json.error).toBeTruthy()
  })
  it('kick answers ok without auth and reveals only a count', async () => {
    const r = await fetch(`${BASE_URL}/api/webhooks/kick`, { method: 'POST' })
    expect(r.status).toBe(200)
    const j = await r.json()
    expect(j.ok).toBe(true)
    expect(Object.keys(j).sort()).toEqual(expect.arrayContaining(['ok']))
  })
})
