import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { rateLimitedResult, withUsage } from '@/lib/mcp/usage'
import { canonicalName } from '@/lib/mcp/registry'
import { kstDays, toAgentUsage } from '@/lib/data/mcp-usage'

const ok = { result: { content: [{ type: 'text' as const, text: '{}' }] }, status: 'ok' as const }
const ctx = (begin: unknown, over: Partial<{ dev: boolean; bearer: string | null }> = {}) => {
  const rpc = vi.fn(async (fn: string) => (fn === 'mcp_usage_begin' ? { data: begin, error: null } : { data: null, error: null }))
  return { dev: false, bearer: 'aisubal_' + 'a'.repeat(48), rpc, ...over }
}

describe('A66 P3 usage log + rate limits', () => {
  it('logs begin, runs the tool, then ends with status and latency', async () => {
    const c = ctx({ ok: true, id: 7 })
    const run = vi.fn(async () => ok)
    expect(await withUsage(c, 'feed_list', run)).toBe(ok.result)
    expect(run).toHaveBeenCalledOnce()
    await new Promise((r) => setTimeout(r, 0))
    expect(c.rpc).toHaveBeenCalledWith('mcp_usage_begin', { p_token: c.bearer, p_tool: 'feed_list' })
    expect(c.rpc).toHaveBeenCalledWith('mcp_usage_end', expect.objectContaining({ p_id: 7, p_status: 'ok', p_latency_ms: expect.any(Number) }))
  })
  it('a limited call never runs and tells the agent when to retry', async () => {
    const c = ctx({ ok: false, limited: { scope: 'token', window: 'minute', limit: 60, retryAfter: 12 } })
    const run = vi.fn(async () => ok)
    const r = await withUsage(c, 'feed_list', run)
    expect(run).not.toHaveBeenCalled()
    expect(r.isError).toBe(true)
    expect(JSON.parse(r.content[0].text)).toMatchObject({ rateLimited: true, retryAfter: 12, limit: 60, window: 'minute', scope: 'token' })
    expect(JSON.parse(rateLimitedResult({ scope: 'member', window: 'day', limit: 5000, retryAfter: 30 }).content[0].text).error).toMatch(/owner's agents together.*5000.*per day.*30s/)
  })
  it('fails open when the log is down; dev and token-less calls are not logged', async () => {
    const down = { dev: false, bearer: 'aisubal_' + 'b'.repeat(48), rpc: vi.fn(async () => { throw new Error('db down') }) }
    expect(await withUsage(down, 'x', async () => ok)).toBe(ok.result)
    const dev = ctx({ ok: true, id: 1 }, { dev: true })
    await withUsage(dev, 'x', async () => ok)
    expect(dev.rpc).not.toHaveBeenCalled()
  })
  it('aliases are logged under the current name', () => {
    expect(canonicalName('list_tools')).toBe('gallery_list')
    expect(canonicalName('feed_list')).toBe('feed_list')
    expect(canonicalName('nope')).toBe('nope')
  })
  it('migration: table closed to clients, token-verified RPCs, limits in site_config', () => {
    const sql = readFileSync('supabase/migrations/0114_mcp_usage.sql', 'utf8')
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/revoke all on table public\.mcp_usage from public, anon, authenticated/)
    expect(sql).toMatch(/grant execute on function public\.mcp_usage_begin\(text, text\), public\.mcp_usage_end\(text, bigint, text, integer\) to anon, authenticated/)
    expect(sql).not.toMatch(/grant execute on function public\.mcp_usage_(summary|admin)[^;]*anon/)
    expect(sql).toMatch(/'mcp_rate_token_per_min', '60'/)
  })
  it('usage view: 7 KST days, zero-filled, oldest first; limits default when missing', () => {
    const now = Date.parse('2026-11-24T16:30:00Z') // 2026-11-25 01:30 KST
    expect(kstDays(3, now)).toEqual(['2026-11-23', '2026-11-24', '2026-11-25'])
    const u = toAgentUsage({ days: 3, total: '5', byDay: [{ day: '2026-11-24', calls: 5 }] }, now)
    expect(u.byDay).toEqual([{ day: '2026-11-23', calls: 0 }, { day: '2026-11-24', calls: 5 }, { day: '2026-11-25', calls: 0 }])
    expect(u.total).toBe(5)
    expect(u.limits.tokenPerMin).toBe(60)
  })
})
