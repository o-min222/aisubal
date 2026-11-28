import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'
import { McpContext, type ToolFilter } from '@/lib/mcp/dispatch'
import { buildServer } from '@/lib/mcp/server'
import { TOOL_SPECS, isAdminTool } from '@/lib/mcp/registry'
import { connectScopes } from '@/lib/agent-connect'

/** A81: a token whose owner and scopes are fixed (no network: no bearer, so no usage log either) */
class TokenCtx extends McpContext {
  override readonly dev = false
  constructor(private readonly f: ToolFilter) {
    super(null, 'https://x.test')
  }
  override filter() {
    return Promise.resolve(this.f)
  }
}

async function connect(f: ToolFilter) {
  const server = await buildServer(new TokenCtx(f), { initialize: false })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await server.connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  return client
}

const ADMIN_TOOLS = TOOL_SPECS.filter(isAdminTool).map((t) => t.name)
const errorText = (r: unknown) => JSON.stringify((r as { content: Array<{ text: string }> }).content.map((c) => c.text))

describe('A81 admin MCP tools are invisible to members', () => {
  it('a member token: tools/list, prompts and resources carry no admin tool', async () => {
    const c = await connect({ scopes: connectScopes(false, false), isAdmin: false })
    const names = (await c.listTools()).tools.map((t) => t.name)
    // A148: no hard-coded count (it drifted with every new tool); the member list is the full
    // non-admin registry minus scope-gated tools, and must never be empty
    expect(names.length).toBeGreaterThan(30)
    expect(names.length).toBeLessThanOrEqual(TOOL_SPECS.length - ADMIN_TOOLS.length)
    for (const n of ADMIN_TOOLS) expect(names).not.toContain(n)
    const dump = JSON.stringify([(await c.listPrompts()).prompts, (await c.listResourceTemplates()).resourceTemplates])
    expect(dump).not.toMatch(/review_|admin/)
  })

  it('a member token with tools:review smuggled in still sees no admin tool', async () => {
    const c = await connect({ scopes: [...connectScopes(false, false), 'tools:review'], isAdmin: false })
    for (const n of ADMIN_TOOLS) expect((await c.listTools()).tools.map((t) => t.name)).not.toContain(n)
  })

  it('calling an admin tool (or its old name) as a member looks exactly like an unknown tool', async () => {
    const c = await connect({ scopes: connectScopes(false, false), isAdmin: false })
    const unknown = await c.callTool({ name: 'no_such_tool', arguments: {} })
    expect(errorText(unknown)).toContain('Unknown tool: no_such_tool')
    for (const n of [...ADMIN_TOOLS, 'review_queue_list', 'review_approve']) {
      const r = await c.callTool({ name: n, arguments: { submissionId: '00000000-0000-0000-0000-000000000000', action: 'approve' } })
      expect(r.isError).toBe(true)
      expect(errorText(r)).toBe(JSON.stringify([JSON.stringify({ error: `Unknown tool: ${n}` })]))
    }
  })

  it('an admin token with tools:review gets every tool', async () => {
    const c = await connect({ scopes: connectScopes(true, true), isAdmin: true })
    const names = (await c.listTools()).tools.map((t) => t.name)
    for (const n of ADMIN_TOOLS) expect(names).toContain(n)
    // exactly the member list plus the admin tools (scope-gated extras allowed)
    const member = (await (await connect({ scopes: connectScopes(false, false), isAdmin: false })).listTools()).tools.map((t) => t.name)
    for (const n of member) expect(names).toContain(n)
    expect(names.length).toBeGreaterThanOrEqual(member.length + ADMIN_TOOLS.length)
    expect(names.length).toBeLessThanOrEqual(TOOL_SPECS.length)
  })
})
