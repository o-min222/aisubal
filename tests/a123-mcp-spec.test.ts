import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { listTools } from '@/lib/mcp/registry'
import { MCP_CONFIG_VERSION } from '@/lib/mcp/config-version'
import { mcpOriginAllowed } from '@/lib/mcp/http-origin'

const SQL = readFileSync(new URL('../supabase/migrations/0146_mcp_spec_and_agent_tools.sql', import.meta.url), 'utf8')

describe('A123 SQL contract', () => {
  it('bumps the config version and adds own-content + article RPCs with tight grants', () => {
    expect(SQL).toContain(`select '${MCP_CONFIG_VERSION}'::text`)
    for (const fn of ['mcp_feed_edit', 'mcp_feed_delete', 'mcp_agora_edit', 'mcp_agora_delete', 'mcp_article_list', 'mcp_article_get', 'mcp_article_search']) {
      expect(SQL).toContain(fn)
    }
    expect(SQL).toMatch(/grant execute on function[\s\S]*mcp_feed_edit[\s\S]*to anon, authenticated/)
    expect(SQL).toMatch(/revoke all on function[\s\S]*mcp_feed_edit[\s\S]*from public/)
    expect(SQL).toContain('feed_not_owner')
    expect(SQL).toContain('agora_not_owner')
    expect(SQL).toContain('article__visible')
  })
})

describe('A123 MCP spec surface', () => {
  it('lists tools with 2025-11-25 annotations, outputSchema, and structured hints', () => {
    const read = listTools().find((t) => t.name === 'feed_list')!
    const del = listTools().find((t) => t.name === 'feed_delete')!
    const mention = listTools().find((t) => t.name === 'agent_mention_reply')!
    expect(read.annotations).toEqual({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true })
    expect(del.annotations.destructiveHint).toBe(true)
    expect(del.annotations.readOnlyHint).toBe(false)
    expect(mention.annotations.idempotentHint).toBe(true)
    expect(read.outputSchema).toEqual({ type: 'object', additionalProperties: true })
    expect(listTools().every((t) => t.outputSchema.type === 'object')).toBe(true)
  })

  it('allows missing Origin and same-site Origin, and rejects a foreign website', () => {
    expect(mcpOriginAllowed(null, 'aisubal.vercel.app')).toBe(true)
    expect(mcpOriginAllowed('https://aisubal.vercel.app', 'aisubal.vercel.app')).toBe(true)
    expect(mcpOriginAllowed('http://127.0.0.1:43210', '127.0.0.1:43210')).toBe(true)
    expect(mcpOriginAllowed('https://aisubal-git-main-dudals2014-1912s-projects.vercel.app', 'example.com')).toBe(true)
    expect(mcpOriginAllowed('https://evil.example', 'aisubal.vercel.app')).toBe(false)
    expect(mcpOriginAllowed('not-a-url', 'aisubal.vercel.app')).toBe(false)
  })
})
