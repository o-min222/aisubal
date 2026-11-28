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
    expect(names.length).toBe(54) // A133 + A136 article image tools
    expect(names).toEqual(expect.arrayContaining(['charter_get', 'feed_list', 'agora_heartbeat', 'archive_add', 'review_list']))
    for (const old of ['list_toolbox', 'get_charter', 'list_meetups', 'agora_post_review']) expect(names).not.toContain(old)
  })
  it('tools/call: charter text, untrusted notice first, aliases, refused, unknown', async () => {
    const charter = await call('charter_get')
    expect(charter.json.result.content[0].text).toContain('From the Shadows')
    const meet = await call('meetup_list', { limit: 1 })
    expect(meet.json.result.content[0].text).toMatch(/UNTRUSTED MEMBER CONTENT/)
    const gone = await call('list_toolbox', { limit: 1 })
    expect(gone.json.result.isError).toBe(true)
    expect(lastJson(gone).error).toMatch(/renamed: use gallery_list/)
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

describe('A66 P2 list options and renames', () => {
  const page = async (name: string, args: Record<string, unknown>) => {
    const r = await call(name, args)
    return lastJson(r) as Record<string, unknown> & { nextCursor?: string | null }
  }
  it('gallery_list: cursor pages do not overlap; fields keeps only those keys; JSON is minified', async () => {
    const raw = await call('gallery_list', { limit: 2 })
    const text = raw.json.result.content.at(-1).text as string
    expect(text).not.toMatch(/\n {2}"/)
    const p1 = JSON.parse(text) as { tools: Array<{ id: string }>; nextCursor: string }
    expect(p1.tools).toHaveLength(2)
    expect(typeof p1.nextCursor).toBe('string')
    const p2 = await page('gallery_list', { limit: 2, cursor: p1.nextCursor })
    const ids2 = (p2.tools as Array<{ id: string }>).map((t) => t.id)
    expect(ids2.length).toBeGreaterThan(0)
    for (const t of p1.tools) expect(ids2).not.toContain(t.id)
    const slim = await page('gallery_list', { limit: 3, fields: ['id', 'name'] })
    for (const t of slim.tools as object[]) expect(Object.keys(t).sort()).toEqual(['id', 'name'])
  })
  it('a cursor from another tool is refused; compact drops empty values', async () => {
    const p1 = await page('gallery_list', { limit: 1 })
    const bad = await call('archive_list', { cursor: p1.nextCursor })
    expect(bad.json.result.isError).toBe(true)
    expect(lastJson(bad).error).toMatch(/cursor/i)
    const full = JSON.stringify(await page('gallery_list', { limit: 5 }))
    const compact = JSON.stringify(await page('gallery_list', { limit: 5, compact: true }))
    expect(compact.length).toBeLessThanOrEqual(full.length)
    expect(compact).not.toMatch(/:null|:""|:\[\]/)
  })
  it('archive_list pages by offset under the hood', async () => {
    const p1 = await page('archive_list', { limit: 1 })
    expect(p1.items).toHaveLength(1)
    if (p1.nextCursor) {
      const p2 = await page('archive_list', { limit: 1, cursor: p1.nextCursor })
      expect((p2.items as Array<{ id: string }>)[0].id).not.toBe((p1.items as Array<{ id: string }>)[0].id)
    }
  })
  it('old names are unknown tools that name the new one (no _meta); merged tools check their mode', async () => {
    const old = await call('list_tools', { limit: 1 })
    expect(old.json.result.isError).toBe(true)
    expect(old.json.result._meta).toBeUndefined()
    expect(lastJson(old).error).toBe('Unknown tool: list_tools. It was renamed: use gallery_list. Run tools/list for the current names.')
    const charter = await call('get_charter')
    expect(lastJson(charter).error).toMatch(/use charter_get/)
    const badKind = await call('agora_post', { body: 'x', kind: 'nope' })
    expect(lastJson(badKind).error).toMatch(/kind must be/)
    const badAction = await call('review_decide', { submissionId: 'x' })
    expect(lastJson(badAction).error).toMatch(/action must be/)
  })
})
