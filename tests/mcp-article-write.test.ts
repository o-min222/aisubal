import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TOOL_SPECS } from '@/lib/mcp/tools'
import { MEMBER_SCOPES } from '@/lib/agent-connect'
import { WRITE_SCOPES } from '@/lib/oauth/core'
import { MCP_CONFIG_VERSION } from '@/lib/mcp/config-version'
import { dataErrorMessage } from '@/lib/mcp-data'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A133 · agents can write articles on behalf of their owner', () => {
  it('exposes article_create, article_edit and article_delete under article:write', () => {
    const names = TOOL_SPECS.map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['article_create', 'article_edit', 'article_delete']))
    for (const name of ['article_create', 'article_edit', 'article_delete']) {
      const t = TOOL_SPECS.find((x) => x.name === name)!
      expect(t.scopes).toEqual(['article:write'])
      expect(t.write).toBe(true)
      expect(t.domain).toBe('article')
    }
  })

  it('new and default member connections include the article:write scope', () => {
    expect(MEMBER_SCOPES).toContain('article:write')
    expect(WRITE_SCOPES).toContain('article:write')
  })

  it('does not bump MCP_CONFIG_VERSION (scope is granted in place; 최신화 would rotate secrets)', () => {
    expect(MCP_CONFIG_VERSION).toBe('2026-11-28.2')
    expect(read('supabase/migrations/0152_mcp_article_write.sql')).not.toContain('mcp_config_version()')
  })

  it('0152 stores agent_token_id and publishes through the same writer and 5/day rules', () => {
    const sql = read('supabase/migrations/0152_mcp_article_write.sql')
    expect(sql).toContain('add column if not exists agent_token_id')
    expect(sql).toContain("api__token(p_token, array['article:write']")
    expect(sql).toContain('article__publish_owned')
    expect(sql).toContain('publish_rate_limited')
    expect(sql).toContain("mcp_article_create")
    expect(sql).toContain("mcp_article_edit")
    expect(sql).toContain("mcp_article_delete")
    expect(sql).toContain('a.agent_token_id is distinct from t.id')
    expect(sql).toContain("'agent', case when a.agent_token_id is null then null else public.article__agent_json")
  })

  it('maps publish and permission errors into clear tool messages', () => {
    expect(dataErrorMessage('not_writer')).toMatch(/article writer/)
    expect(dataErrorMessage('publish_rate_limited')).toMatch(/5 first publishes/)
    expect(dataErrorMessage('forbidden')).toMatch(/only edit or delete articles you wrote/)
    expect(dataErrorMessage('api_scope_missing:article:write')).toMatch(/article:write/)
  })

  it('the agent guide mentions the new write tools', () => {
    const skill = read('src/lib/skill-md.ts')
    expect(skill).toContain('article_create')
    expect(skill).toContain('article_edit')
    expect(skill).toContain('article_delete')
    expect(read('src/lib/mcp/server.ts')).toContain('article_create')
  })
})
