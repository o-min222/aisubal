import { describe, expect, it } from 'vitest'
import { withImpliedReads } from '@/lib/mcp-scopes'
import { REFUSED_TOOLS, RENAMED_TOOLS, TOOL_SCOPES, TOOL_SPECS, getTool, inputJsonSchema, listTools, resolveTool, toolAllowed } from '@/lib/mcp/registry'
import { connectScopes, MEMBER_SCOPES, scopeLabels } from '@/lib/agent-connect'

const all = TOOL_SPECS.map((t) => t.name)

describe('A66 one tool registry', () => {
  it('names are unique and every tool has scopes, a description and an object schema', () => {
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(36) // A69: + profile_set_avatar
    // A66 P2: every name is <domain>_<verb> (gallery submissions live under the gallery_ prefix)
    for (const t of TOOL_SPECS) expect(t.name.startsWith(`${t.domain === 'submit' ? 'gallery' : t.domain}_`), t.name).toBe(true)
    for (const t of TOOL_SPECS) {
      expect(t.scopes.length, t.name).toBeGreaterThan(0)
      expect(t.description.trim().length, t.name).toBeGreaterThan(3)
      expect(inputJsonSchema(t)).toMatchObject({ type: 'object' })
    }
  })
  it('old names no longer resolve, their hints name real tools; refused names are not tools', () => {
    for (const [old, hint] of Object.entries(RENAMED_TOOLS)) {
      expect(getTool(hint.split(' ')[0]), old).toBeDefined()
      expect(all).not.toContain(old)
      expect(resolveTool(old), old).toEqual({ kind: 'unknown' })
    }
    for (const n of Object.keys(REFUSED_TOOLS)) {
      expect(all).not.toContain(n)
      expect(resolveTool(n)).toMatchObject({ kind: 'refused' })
    }
    expect(resolveTool('nope')).toEqual({ kind: 'unknown' })
  })
  it('tools/list keeps the wire shape', () => {
    const t = listTools().find((x) => x.name === 'feed_get')!
    expect(Object.keys(t).sort()).toEqual(['_meta', 'annotations', 'description', 'inputSchema', 'name', 'title'])
    expect(t.annotations.readOnlyHint).toBe(true)
    expect(listTools().find((x) => x.name === 'agora_post')!.annotations.readOnlyHint).toBe(false)
    expect(t._meta).toEqual({ 'aisubal/domain': 'feed', 'aisubal/scopes': ['posts_read', 'feed:interact'] })
    expect(t.inputSchema).toMatchObject({ type: 'object', properties: { postId: { type: 'string' } }, required: ['postId'] })
    expect(t.inputSchema).not.toHaveProperty('$schema')
  })
})

describe('P-1 tools/list is filtered by token scopes', () => {
  it('every advertised tool has a scope rule', () => {
    expect(all.filter((n) => !TOOL_SCOPES[n])).toEqual([])
  })
  it('read-only token sees no write or review tools', () => {
    const scopes = ['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'agora:read'] as const
    const names = listTools({ scopes, isAdmin: false }).map((t) => t.name)
    expect(names).toContain('feed_list')
    expect(names).toContain('charter_get')
    for (const w of ['feed_comment', 'agora_post', 'archive_add', 'gallery_submit', 'review_decide']) expect(names).not.toContain(w)
    // 0058: gallery_install only records a once-per-member install, so read tokens may use it
    expect(names).toContain('gallery_install')
  })
  it('review_* only for admin tokens with tools:review', () => {
    expect(toolAllowed('review_decide', ['tools:review'], false)).toBe(false)
    expect(toolAllowed('review_decide', ['tools:review'], true)).toBe(true)
    expect(toolAllowed('review_get', ['toolbox_read'], true)).toBe(false)
  })
})

describe('P-4 scopes and presets', () => {
  it('write scopes carry their read scope', () => {
    expect(withImpliedReads(['agora:write', 'feed:interact', 'archive:write'])).toEqual(
      expect.arrayContaining(['agora:read', 'posts_read', 'archive:read'])
    )
    expect(MEMBER_SCOPES).toEqual(expect.arrayContaining(['agora:read', 'agora:write']))
  })
  it('connecting grants every member scope; tools:review only for admins who switch it on', () => {
    expect(connectScopes(false, false)).toEqual(expect.arrayContaining(['posts_read', 'archive:read', 'archive:write', 'agora:read', 'agora:write', 'feed:interact', 'tools:submit']))
    expect(connectScopes(false, true)).not.toContain('tools:review')
    expect(connectScopes(true, false)).not.toContain('tools:review')
    expect(connectScopes(true, true)).toContain('tools:review')
  })
  it('scopes show as plain Korean labels', () => {
    expect(scopeLabels(MEMBER_SCOPES)).toEqual(['읽기', '아카이브 보기', '아카이브에 저장', '아고라 글·답글', '피드 답글·좋아요', '갤러리에 올리기'])
    expect(scopeLabels(['tools:review'])).toEqual(['갤러리 검토 (관리자)'])
  })
})
