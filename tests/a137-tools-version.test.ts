import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  applyToolsHint,
  decorateMcpResult,
  diffToolsCatalog,
  mockToolsListGet,
  mockToolsListPut,
  toolsCatalog,
  toolsCatalogBehind,
  toolsChangeMessage,
  toolsHint,
  toolsMeta,
  toolsVersion,
} from '@/lib/mcp/tools-version'
import { SERVER_CAPABILITIES } from '@/lib/mcp/server'
import { MCP_CONFIG_VERSION } from '@/lib/mcp/config-version'
import { skillMarkdown } from '@/lib/skill-md'
import { instructionsFor } from '@/lib/mcp/server'
import type { McpContext } from '@/lib/mcp/dispatch'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const member = { scopes: ['posts_read', 'feed:interact', 'agora:read', 'agora:write', 'article:write'] as const, isAdmin: false }

describe('A137 · toolsVersion catalog hash', () => {
  it('is a stable 32-char hex, and different scopes see different catalogs', () => {
    const a = toolsVersion(member)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(toolsVersion(member)).toBe(a)
    expect(toolsVersion(undefined)).toMatch(/^[0-9a-f]{32}$/)
    expect(toolsCatalog(member)).toContain('article_create@')
    expect(toolsCatalog(member)).toContain('article_image_upload@')
    expect(toolsCatalog({ scopes: ['posts_read'], isAdmin: false })).not.toContain('article_create@')
    expect(toolsVersion({ scopes: ['posts_read'], isAdmin: false })).not.toBe(a)
  })

  it('diffs new, changed and removed tools from the stored fingerprint', () => {
    const next = toolsCatalog(member)
    const mapChanged = next.replace(/article_create@[0-9a-f]+/, 'article_create@deadbeefdeadbeef')
    const removedUpload = next
      .replace(/,?article_image_upload@[0-9a-f]+/, '')
      .replace(/t:article_image_upload@[0-9a-f]+,/, 't:')
    const d = diffToolsCatalog(mapChanged, next)
    expect(d.changed).toContain('article_create')
    expect(d.added).not.toContain('article_create')
    const gone = diffToolsCatalog(next, removedUpload)
    expect(gone.removed).toContain('article_image_upload')
    const added = diffToolsCatalog(removedUpload, next)
    expect(added.added).toContain('article_image_upload')
  })

  it('toolsHint is silent when the last-served hash matches, and names the delta otherwise', () => {
    const current = { toolsVersion: toolsVersion(member), toolsCatalog: toolsCatalog(member) }
    expect(toolsHint(current, { toolsVersion: current.toolsVersion, toolsCatalog: current.toolsCatalog })).toEqual({
      toolsVersion: current.toolsVersion,
      toolsChanged: false,
    })
    const staleCatalog = current.toolsCatalog.replace(/article_create@[0-9a-f]+/, 'article_create@deadbeefdeadbeef').replace(/,?article_image_list@[0-9a-f]+/, '')
    const stale = toolsHint(current, { toolsVersion: '0'.repeat(32), toolsCatalog: staleCatalog })
    expect(stale.toolsChanged).toBe(true)
    if (stale.toolsChanged) {
      expect(stale.newTools).toContain('article_image_list')
      expect(stale.changedTools).toContain('article_create')
      expect(stale.suggestedAction.action).toBe('refresh_tools')
      expect(stale.suggestedAction.tool).toBe('tools/list')
      for (const text of [stale.suggestedAction.why, stale.suggestedAction.whyKo, toolsChangeMessage({ added: ['article_image_upload'], changed: ['article_create'], removed: [] }, 'en'), toolsChangeMessage({ added: ['x'], changed: [], removed: [] }, 'ko')]) {
        expect(text).toMatch(/tools\/list/)
        expect(text).toMatch(/\/mcp reconnect/)
        expect(text).toMatch(/Cursor/)
        expect(text).toMatch(/최신화/)
        expect(text).not.toMatch(/최신화.{0,40}(하세요|해 주세요|please)/)
      }
      expect(stale.suggestedAction.why).toMatch(/Reconnect the AI쓰발 MCP/)
      expect(stale.suggestedAction.why).toMatch(/rotates the token/)
      expect(stale.suggestedAction.whyKo).toMatch(/다시 연결/)
      expect(stale.suggestedAction.whyKo).toMatch(/토큰이 바뀝니다/)
      expect(stale.suggestedAction.why).toContain('article_image_list')
      expect(stale.suggestedAction.why).toContain('article_create')
    }
  })

  it('a connected agent with a missing or old hash is stale; a never-connected one is not', () => {
    const cur = toolsVersion(member)
    expect(toolsCatalogBehind({ lastVersion: null, currentVersion: cur, lastUsedAt: '2026-11-28T00:00:00Z' })).toBe(true)
    expect(toolsCatalogBehind({ lastVersion: 'old', currentVersion: cur, lastUsedAt: '2026-11-28T00:00:00Z' })).toBe(true)
    expect(toolsCatalogBehind({ lastVersion: cur, currentVersion: cur, lastUsedAt: '2026-11-28T00:00:00Z' })).toBe(false)
    expect(toolsCatalogBehind({ lastVersion: null, currentVersion: cur, lastUsedAt: null })).toBe(false)
  })

  it('applyToolsHint prepends a refresh suggestedAction on heartbeat, and tools/list _meta never flags changed', () => {
    const current = { toolsVersion: 'abc', toolsCatalog: 't:new@1' }
    const hint = toolsHint(current, { toolsVersion: 'old', toolsCatalog: 't:old@2' })
    const hb = applyToolsHint({ suggestedActions: [{ action: 'schedule', why: 'later' }], pending: [] }, hint) as Record<string, unknown>
    expect(hb.toolsChanged).toBe(true)
    expect(hb.toolsVersion).toBe('abc')
    expect((hb.suggestedActions as Array<{ action: string }>)[0]?.action).toBe('refresh_tools')
    expect((hb.suggestedActions as Array<{ action: string }>)[1]?.action).toBe('schedule')
    expect(toolsMeta(hint, 'tools/list')).toEqual({ toolsVersion: 'abc' })
    expect(toolsMeta(hint, 'tools/call').toolsChanged).toBe(true)
  })

  it('decorateMcpResult puts toolsVersion on initialize serverInfo and _meta', () => {
    const hint = toolsHint({ toolsVersion: 'abc', toolsCatalog: 't:n@1' }, { toolsVersion: 'old', toolsCatalog: 't:o@2' })
    const out = decorateMcpResult('initialize', {
      jsonrpc: '2.0',
      id: 1,
      result: { protocolVersion: '2025-11-25', capabilities: {}, serverInfo: { name: 'aisubal', version: '0.4.0' }, instructions: 'hi' },
    }, hint)
    const r = out.result as { serverInfo: { toolsVersion: string }; _meta: { toolsVersion: string; toolsChanged: boolean } }
    expect(r.serverInfo.toolsVersion).toBe('abc')
    expect(r._meta.toolsVersion).toBe('abc')
    expect(r._meta.toolsChanged).toBe(true)
  })

  it('mock last-served starts stale, and a fresh tools/list stamp clears it', () => {
    const token = 'test-a137-token'
    mockToolsListPut(token, { toolsVersion: null, toolsCatalog: null })
    const current = { toolsVersion: toolsVersion(member), toolsCatalog: toolsCatalog(member) }
    expect(toolsHint(current, mockToolsListGet(token)).toolsChanged).toBe(true)
    mockToolsListPut(token, current)
    expect(toolsHint(current, mockToolsListGet(token))).toEqual({ toolsVersion: current.toolsVersion, toolsChanged: false })
  })
})

describe('A137 · wiring, docs, capabilities, migration', () => {
  it('does not declare tools.listChanged (the server is stateless and cannot push)', () => {
    expect('listChanged' in SERVER_CAPABILITIES.tools).toBe(false)
    expect(read('src/lib/mcp/server.ts')).toMatch(/listChanged: true would not be truthful/)
    expect(read('src/app/api/mcp/route.ts')).toMatch(/no sessions and no server-initiated SSE/)
  })

  it('does not bump MCP_CONFIG_VERSION (최신화 would rotate the token)', () => {
    expect(MCP_CONFIG_VERSION).toBe('2026-11-28.2')
    expect(read('supabase/migrations/0154_mcp_tools_version.sql')).not.toContain('mcp_config_version()')
  })

  it('skill.md, initialize instructions and /agents tell agents to re-list, not to 최신화', async () => {
    const skill = skillMarkdown('https://x.test')
    expect(skill).toMatch(/toolsChanged: true/)
    expect(skill).toMatch(/tools\/list/)
    expect(skill).toMatch(/\/mcp reconnect/)
    expect(skill).toMatch(/Do \*\*not\*\* use 최신화/)
    const ctx = { self: async () => null, origin: 'https://x.test' } as unknown as McpContext
    const inst = await instructionsFor(ctx)
    expect(inst).toMatch(/toolsChanged: true/)
    expect(inst).toMatch(/\/mcp reconnect/)
    expect(inst).toMatch(/Do not use 최신화/)
    const list = read('src/components/agents/agent-list.tsx')
    expect(list).toContain('새 도구가 있어요 · 다시 연결')
    expect(list).toContain('toolsCatalogBehind')
  })

  it('0154 locks the new columns down and only stamps tools/list through mcp_ping', () => {
    const sql = read('supabase/migrations/0154_mcp_tools_version.sql')
    expect(sql).toContain('add column if not exists tools_version text')
    expect(sql).toContain('add column if not exists tools_catalog text')
    expect(sql).toContain('revoke insert (tools_version, tools_catalog)')
    expect(sql).toContain('revoke update (tools_version, tools_catalog)')
    expect(sql).toContain('grant select (tools_version) on public.api_tokens to authenticated')
    expect(sql).not.toMatch(/grant (select|insert|update|all)[^;]*tools_catalog[^;]* to (anon|authenticated)/)
    expect(sql).toContain('drop function if exists public.mcp_ping(text, text)')
    expect(sql).toContain('p_tools_version text default null')
    expect(sql).toContain("'toolsVersion', t.tools_version")
    expect(sql).toContain('grant execute on function public.mcp_ping(text, text, text, text) to anon, authenticated')
    expect(sql).toContain('revoke all on function public.mcp_ping(text, text, text, text) from public')
  })
})
