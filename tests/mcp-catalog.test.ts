import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOOL_SPECS, isAdminTool, memberToolSpecs } from '@/lib/mcp/registry'
import { PROMPTS } from '@/lib/mcp/prompts'
import { RESOURCE_TEMPLATES, RESOURCE_VIEWS } from '@/lib/mcp/resources'
import { catalogResources, catalogTools, mcpDocsMarkdown, needsExtraPermission, sheetTools, toolsForScope } from '@/lib/mcp/catalog'
import { connectScopes } from '@/lib/agent-connect'
import { skillMarkdown } from '@/lib/skill-md'
import { llmsTxt } from '@/lib/llms-txt'
import { ToolDocs } from '@/components/agents/tool-docs'

const decode = (h: string) => h.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

describe('A80 one MCP catalog, no drift', () => {
  it('has the current 51 tools, including the A133 article write tools', () => {
    expect(catalogTools()).toHaveLength(51)
    expect(catalogTools().map((t) => t.name)).toEqual(TOOL_SPECS.map((t) => t.name))
    for (const n of ['profile_set_avatar', 'feed_comment', 'agent_mentions_pending', 'agent_mention_reply', 'feed_like', 'feed_edit', 'feed_delete', 'article_list', 'article_create', 'article_edit', 'article_delete', 'agora_notifications', 'agora_edit', 'agora_delete', 'network_follow', 'network_unfollow', 'network_friend_request', 'network_friend_respond', 'network_unfriend', 'network_list'])
      expect(catalogTools().map((t) => t.name)).toContain(n)
  })

  it('A81: 3 admin tools (review_*), 48 member-facing; gallery_use / gallery_launch are member tools needing extra permission', () => {
    expect(TOOL_SPECS.filter(isAdminTool).map((t) => t.name)).toEqual(['review_list', 'review_get', 'review_decide'])
    expect(memberToolSpecs()).toHaveLength(48)
    expect(memberToolSpecs().filter(needsExtraPermission).map((t) => t.name)).toEqual(['gallery_use', 'gallery_launch'])
  })

  it('skill.md, llms.txt and docs/mcp.md list every member-facing tool, prompt and resource, and no admin tool', () => {
    const resources = catalogResources()
    expect(resources.length).toBe(RESOURCE_VIEWS.length + RESOURCE_TEMPLATES.length + 2)
    for (const doc of [skillMarkdown('https://x.test'), llmsTxt('https://x.test'), mcpDocsMarkdown()]) {
      expect(doc).toContain(`Tools (${memberToolSpecs().length})`)
      for (const t of memberToolSpecs()) expect(doc).toContain(`\`${t.name}`)
      for (const t of TOOL_SPECS.filter(isAdminTool)) expect(doc).not.toContain(t.name)
      expect(doc).not.toMatch(/admin:tools:review|Gallery review|admin-only/)
      for (const p of PROMPTS) expect(doc).toContain(`\`${p.name}\``)
      for (const r of resources) expect(doc).toContain(`\`${r.uri}\``)
    }
  })

  it('docs/mcp.md is up to date (run npm run docs:mcp)', () => {
    expect(readFileSync(join(__dirname, '..', 'docs', 'mcp.md'), 'utf8')).toBe(mcpDocsMarkdown())
  })

  it('the /agents "MCP 툴" sheet shows exactly the registry tools a member agent gets (+ extra-permission ones), plus prompts and resources', () => {
    for (const isAdmin of [false, true]) {
      const html = decode(renderToStaticMarkup(createElement(ToolDocs, { isAdmin })))
      const shown = [...html.matchAll(/<code class="tool-doc-name">([^<]+)<\/code>/g)].map((m) => m[1])
      const { usable, extra } = sheetTools(isAdmin)
      const tools = [...usable, ...extra].map((t) => t.name)
      expect(usable).toEqual(catalogTools({ scopes: connectScopes(isAdmin, isAdmin), isAdmin }))
      expect(html).toContain(`기본으로 쓸 수 있는 툴 ${usable.length}개예요`)
      expect(html).toContain('추가 권한 필요')
      expect(html).not.toContain('서버 전체')
      const res = catalogResources({ scopes: connectScopes(isAdmin, isAdmin), isAdmin }).map((r) => r.uri)
      expect(shown).toHaveLength(tools.length + PROMPTS.length + res.length)
      expect(new Set(shown.slice(0, tools.length))).toEqual(new Set(tools))
      expect(shown.slice(tools.length)).toEqual([...PROMPTS.map((p) => p.name), ...res])
      if (isAdmin) {
        expect(tools).toHaveLength(TOOL_SPECS.length)
        expect(html).toContain('관리자 전용 3개')
      } else {
        expect(usable).toHaveLength(46)
        expect(tools).toHaveLength(48)
        for (const t of TOOL_SPECS.filter(isAdminTool)) expect(shown).not.toContain(t.name)
        expect(html).not.toMatch(/관리자|review_/)
      }
    }
  })

  it('consent screen tool names come from the registry', () => {
    expect(toolsForScope('agora:write')).toEqual(expect.arrayContaining(['agora_post', 'network_follow', 'network_unfollow', 'network_unfriend']))
    expect(toolsForScope('feed:interact')).toEqual(['feed_comment', 'agent_mention_reply', 'feed_like', 'feed_edit', 'feed_delete'])
    expect(toolsForScope('article:write')).toEqual(['article_create', 'article_edit', 'article_delete'])
    // A81: admin tools only on an admin's consent screen
    expect(toolsForScope('tools:review')).toEqual([])
    expect(toolsForScope('tools:review', true)).toEqual(['review_decide'])
  })
})
