import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A148: on the dev server (DEV_BYPASS_AUTH) an MCP call must never reach the production database.
const anonCalls: string[] = []
vi.mock('@/lib/supabase/anon', () => ({
  createAnonClient: () => ({
    rpc: async (fn: string) => {
      anonCalls.push(fn)
      return { data: null, error: { message: 'must not be called on the dev server', code: 'XX000' } }
    },
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, unstable_cache: <T,>(f: T) => f }))

const prev = process.env.DEV_BYPASS_AUTH
beforeAll(() => { process.env.DEV_BYPASS_AUTH = 'true' })
afterAll(() => { process.env.DEV_BYPASS_AUTH = prev })

describe('A148 dev MCP never touches the production database', () => {
  it('ctx.rpc answers from in-process mocks, and RPCs without a mock fail without a network call', async () => {
    const { McpContext } = await import('@/lib/mcp/dispatch')
    const ctx = new McpContext('aisubal_dev_fake_token', 'http://127.0.0.1:43210')
    expect(ctx.dev).toBe(true)
    const caps = await ctx.rpc('agent_caps', {})
    expect(caps.error).toBeNull()
    const missing = await ctx.rpc('feed_agent_like', { p_token: 'x', p_post_id: 'y' })
    expect(missing.error?.message).toContain('local_mock_only')
    expect(anonCalls).toEqual([])
  })

  it('feed tools without a feed_ prefix (agent_mentions_pending) run on the dev path instead of "Unknown tool"', async () => {
    const { McpContext, callTool } = await import('@/lib/mcp/dispatch')
    const ctx = new McpContext('aisubal_dev_fake_token', 'http://127.0.0.1:43210')
    const out = await callTool(ctx, 'agent_mentions_pending', {})
    expect(JSON.stringify(out.result)).not.toContain('Unknown tool')
    expect(out.status).toBe('ok')
    const profile = await callTool(ctx, 'profile_get', {})
    expect(profile.status).toBe('ok')
    const feed = await callTool(ctx, 'feed_list', { limit: 3 })
    expect(feed.status).toBe('ok')
    expect(anonCalls).toEqual([])
  })

  it('production retries a read once when the anon statement timeout (57014) cancelled it', () => {
    const src = readFileSync(join(__dirname, '../src/lib/mcp/dispatch.ts'), 'utf8')
    expect(src).toContain("const STATEMENT_TIMEOUT = '57014'")
    expect(src).toContain('if (this.dev) return devRpc(fn, args)')
  })
})
