import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TOOL_SCOPES, filterToolsForToken, toolAllowed, withImpliedReads } from '@/lib/mcp-scopes'
import { CHARTER_TOOL } from '@/lib/pledge'
import { ARCHIVE_TOOLS } from '@/lib/archive-mcp'
import { AGORA_TOOLS } from '@/lib/agora-mcp'
import { FEED_TOOLS, MEETUP_READ_TOOLS } from '@/lib/mcp-data'
import { REVIEW_TOOLS, SUBMIT_TOOLS } from '@/lib/tool-review'
import { connectScopes, MEMBER_SCOPES, scopeLabels } from '@/lib/agent-connect'

// route.ts keeps its own TOOLS array (route files can't export it): read names from source
const routeSrc = readFileSync('src/app/api/mcp/route.ts', 'utf8')
const routeBlock = routeSrc.slice(routeSrc.indexOf('const TOOLS = ['), routeSrc.indexOf('\n]\n', routeSrc.indexOf('const TOOLS = [')))
const routeNames = [...routeBlock.matchAll(/name:\s*'([a-z_]+)'/g)].map((m) => m[1])
const all = [CHARTER_TOOL, ...ARCHIVE_TOOLS, ...AGORA_TOOLS, ...FEED_TOOLS, ...MEETUP_READ_TOOLS, ...SUBMIT_TOOLS, ...REVIEW_TOOLS].map((t) => t.name).concat(routeNames)

describe('P-1 tools/list is filtered by token scopes', () => {
  it('every advertised tool has a scope rule', () => {
    expect(routeNames.length).toBeGreaterThan(4)
    expect(all.filter((n) => !TOOL_SCOPES[n])).toEqual([])
  })
  it('read-only token sees no write or review tools', () => {
    const scopes = ['posts_read', 'meetups_read', 'toolbox_read', 'archive:read', 'agora:read'] as const
    const names = filterToolsForToken(all.map((name) => ({ name })), scopes, false).map((t) => t.name)
    expect(names).toContain('feed_list')
    expect(names).toContain('get_charter')
    for (const w of ['feed_comment', 'agora_post', 'archive_add', 'submit_tool', 'review_approve']) expect(names).not.toContain(w)
    // 0058: install_tool only records a once-per-member install, so read tokens may use it
    expect(names).toContain('install_tool')
  })
  it('review_* only for admin tokens with tools:review', () => {
    expect(toolAllowed('review_approve', ['tools:review'], false)).toBe(false)
    expect(toolAllowed('review_approve', ['tools:review'], true)).toBe(true)
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
