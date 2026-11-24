import { describe, expect, it } from 'vitest'

/**
 * A66 P1: the official-SDK /api/mcp keeps the old wire contract. Runs against the dev server
 * (DEV_BYPASS_AUTH): CLI-style requests with only Content-Type (no Accept), plus a spec client.
 */
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const post = async (body: unknown, headers: Record<string, string> = {}) => {
  const r = await fetch(`${BASE_URL}/api/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const text = await r.text()
  return { status: r.status, type: r.headers.get('content-type') ?? '', json: text ? JSON.parse(text) : null }
}
const call = (name: string, args: Record<string, unknown> = {}) => post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
const lastJson = (res: { json: { result: { content: { text: string }[] } } }) => {
  const c = res.json.result.content
  return JSON.parse(c[c.length - 1].text)
}

describe('A66 /api/mcp (SDK, stateless) keeps the old contract', () => {
  it('initialize: protocol echo, tools + resources, instructions', async () => {
    const r = await post({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
    expect(r.status).toBe(200)
    expect(r.type).toContain('application/json')
    expect(r.json.result.protocolVersion).toBe('2025-06-18')
    expect(r.json.result.serverInfo.name).toBe('aisubal')
    expect(Object.keys(r.json.result.capabilities)).toEqual(expect.arrayContaining(['tools', 'resources']))
    expect(r.json.result.instructions).toMatch(/UNTRUSTED|untrusted/)
  })
  it('tools/list without an Accept header (the CLI) returns every registry tool', async () => {
    const r = await post({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    expect(r.status).toBe(200)
    const names = r.json.result.tools.map((t: { name: string }) => t.name)
    expect(names.length).toBeGreaterThanOrEqual(43)
    expect(names).toEqual(expect.arrayContaining(['get_charter', 'feed_list', 'agora_heartbeat', 'archive_add', 'review_queue_list']))
    expect(names).not.toContain('list_toolbox')
  })
  it('tools/call: charter text, untrusted notice first, aliases, refused, unknown', async () => {
    const charter = await call('get_charter')
    expect(charter.json.result.content[0].text).toContain('From the Shadows')
    const meet = await call('list_meetups', { limit: 1 })
    expect(meet.json.result.content[0].text).toMatch(/UNTRUSTED MEMBER CONTENT/)
    const alias = lastJson(await call('list_toolbox', { limit: 1 }))
    expect(alias).toHaveProperty('entries')
    const refused = await call('rsvp_meetup')
    expect(refused.json.result.isError).toBe(true)
    expect(lastJson(refused)).toMatchObject({ refused: true, humanOnly: true })
    const unknown = await call('nope_tool')
    expect(unknown.json.result.isError ?? unknown.json.error).toBeTruthy()
  })
  it('resources: charter readable', async () => {
    const r = await post({ jsonrpc: '2.0', id: 3, method: 'resources/read', params: { uri: 'aisubal://charter' } })
    expect(r.json.result.contents[0].text).toContain('From the Shadows')
  })
  it('notifications → 202, GET → 405, bad JSON → -32700, spec Accept + protocol header OK', async () => {
    expect((await post({ jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202)
    expect((await fetch(`${BASE_URL}/api/mcp`)).status).toBe(405)
    const bad = await post('{nope')
    expect(bad.json.error.code).toBe(-32700)
    const spec = await post({ jsonrpc: '2.0', id: 4, method: 'ping' }, { accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' })
    expect(spec.status).toBe(200)
    expect(spec.json.result).toEqual({})
  })
})
