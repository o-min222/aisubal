import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MCP_CONFIG_VERSION, mcpConfigBehind } from '@/lib/mcp/config-version'

const SQL = readFileSync(new URL('../supabase/migrations/0145_mcp_config_refresh.sql', import.meta.url), 'utf8')

describe('A122 MCP refresh SQL contract', () => {
  it('records config version, prepares a pending secret, and tightens grants', () => {
    expect(SQL).toMatch(/add column if not exists mcp_config_version text/)
    expect(SQL).toMatch(/add column if not exists pending_token_hash text/)
    expect(SQL).toMatch(/add column if not exists pending_token_prefix text/)
    expect(SQL).toContain("select '2026-11-28'::text")
    expect(SQL).toContain(MCP_CONFIG_VERSION)
    expect(SQL).toMatch(/grant select \(mcp_config_version, pending_token_prefix, pending_created_at\) on public.api_tokens to authenticated/)
    expect(SQL).toMatch(/revoke update \(mcp_config_version, pending_token_hash, pending_token_prefix, pending_created_at\)/)
    expect(SQL).toMatch(/revoke all on function public.api__find_token\(text\) from public, anon, authenticated/)
    expect(SQL).toMatch(/revoke all on function public.api__touch_token\(uuid, text, text\) from public, anon, authenticated/)
    expect(SQL).toMatch(/grant execute on function public.api_token_rotate_commit\(uuid\), public.api_token_rotate_cancel\(uuid\) to authenticated/)
    expect(SQL).toMatch(/revoke all on function public.api_token_rotate_commit\(uuid\), public.api_token_rotate_cancel\(uuid\) from public, anon/)
    expect(SQL).toContain('pending_token_hash = p_hash')
    expect(SQL).toContain('token_hash = pending_token_hash')
    expect(SQL).toContain('or pending_token_hash = v_hash')
    expect(SQL).not.toMatch(/grant select \(.*pending_token_hash/)
  })

  it('does not immediately replace the current hash on rotate', () => {
    const rotate = SQL.slice(SQL.indexOf('create or replace function public.api_token_rotate('))
    const body = rotate.slice(0, rotate.indexOf('create or replace function public.api_token_rotate_commit'))
    expect(body).toContain('pending_token_hash = p_hash')
    expect(body).not.toMatch(/set token_hash = p_hash/)
  })
})

describe('mcpConfigBehind', () => {
  it('flags connected agents that have not seen the current version', () => {
    expect(mcpConfigBehind({ version: null, lastUsedAt: '2026-11-01T00:00:00Z' })).toBe(true)
    expect(mcpConfigBehind({ version: '2025-01-01', lastUsedAt: '2026-11-01T00:00:00Z' })).toBe(true)
    expect(mcpConfigBehind({ version: MCP_CONFIG_VERSION, lastUsedAt: '2026-11-01T00:00:00Z' })).toBe(false)
    expect(mcpConfigBehind({ version: null, lastUsedAt: null })).toBe(false)
  })
})

describe('safe rotate mock', () => {
  it('keeps the old secret until the new one is used, then retires it on first use or explicit commit', async () => {
    process.env.DEV_BYPASS_AUTH = 'true'
    const {
      issueApiToken,
      rotateApiToken,
      commitRotateApiToken,
      cancelRotateApiToken,
      mockAgentForToken,
      listApiTokens,
    } = await import('@/lib/data/tokens')

    const { token: a } = await issueApiToken('dev-user-id', 'refresh-a', ['feed:interact'], { agentName: '리프레시A', client: 'cursor' })
    const oldA = a.token
    const prepA = await rotateApiToken(a.id)
    expect(prepA.pending).toBe(true)
    expect(prepA.token).toMatch(/^aisubal_[0-9a-f]{48}$/)
    expect(prepA.token).not.toBe(oldA)
    expect(mockAgentForToken(oldA).id).toBe(a.id)
    const listed = (await listApiTokens('dev-user-id')).find((x) => x.id === a.id)
    expect(listed?.pendingPrefix).toBe(prepA.token.slice(0, 12))

    expect(mockAgentForToken(prepA.token).id).toBe(a.id)
    const after = (await listApiTokens('dev-user-id')).find((x) => x.id === a.id)
    expect(after?.pendingPrefix).toBeNull()
    expect(after?.mcpConfigVersion).toBe(MCP_CONFIG_VERSION)
    expect(mockAgentForToken(oldA).id).not.toBe(a.id)

    const { token: b } = await issueApiToken('dev-user-id', 'refresh-b', ['feed:interact'], { agentName: '리프레시B', client: 'cursor' })
    const oldB = b.token
    const prepB = await rotateApiToken(b.id)
    await commitRotateApiToken(b.id)
    expect(mockAgentForToken(prepB.token).id).toBe(b.id)
    expect(mockAgentForToken(oldB).id).not.toBe(b.id)

    const { token: c } = await issueApiToken('dev-user-id', 'refresh-c', ['feed:interact'], { agentName: '리프레시C', client: 'cursor' })
    const oldC = c.token
    await rotateApiToken(c.id)
    await cancelRotateApiToken(c.id)
    expect(mockAgentForToken(oldC).id).toBe(c.id)
    const listedC = (await listApiTokens('dev-user-id')).find((x) => x.id === c.id)
    expect(listedC?.pendingPrefix).toBeNull()
  })
})
