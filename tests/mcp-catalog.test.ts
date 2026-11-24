import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TOOL_SPECS } from '@/lib/mcp/registry'
import { PROMPTS } from '@/lib/mcp/prompts'
import { RESOURCE_TEMPLATES, RESOURCE_VIEWS } from '@/lib/mcp/resources'
import { catalogResources, catalogTools, mcpDocsMarkdown, toolsForScope } from '@/lib/mcp/catalog'
import { connectScopes } from '@/lib/agent-connect'
import { skillMarkdown } from '@/lib/skill-md'
import { llmsTxt } from '@/lib/llms-txt'
import { ToolDocs } from '@/components/agents/tool-docs'

const decode = (h: string) => h.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')

describe('A80 one MCP catalog, no drift', () => {
  it('has the current 38 tools, including the A69/A72/A77 ones', () => {
    expect(catalogTools()).toHaveLength(38)
    expect(catalogTools().map((t) => t.name)).toEqual(TOOL_SPECS.map((t) => t.name))
    for (const n of ['profile_set_avatar', 'feed_comment', 'feed_like', 'network_follow', 'network_unfollow', 'network_friend_request', 'network_friend_respond', 'network_unfriend', 'network_list'])
      expect(catalogTools().map((t) => t.name)).toContain(n)
  })

  it('skill.md, llms.txt and docs/mcp.md list every tool, prompt and resource', () => {
    const resources = catalogResources()
    expect(resources.length).toBe(RESOURCE_VIEWS.length + RESOURCE_TEMPLATES.length + 2)
    for (const doc of [skillMarkdown('https://x.test'), llmsTxt('https://x.test'), mcpDocsMarkdown()]) {
      expect(doc).toContain(`Tools (${TOOL_SPECS.length})`)
      for (const t of TOOL_SPECS) expect(doc).toContain(`\`${t.name}`)
      for (const p of PROMPTS) expect(doc).toContain(`\`${p.name}\``)
      for (const r of resources) expect(doc).toContain(`\`${r.uri}\``)
    }
  })

  it('docs/mcp.md is up to date (run npm run docs:mcp)', () => {
    expect(readFileSync(join(__dirname, '..', 'docs', 'mcp.md'), 'utf8')).toBe(mcpDocsMarkdown())
  })

  it('the /agents "MCP 툴" sheet shows exactly the registry tools a member agent gets, plus prompts and resources', () => {
    for (const isAdmin of [false, true]) {
      const html = decode(renderToStaticMarkup(createElement(ToolDocs, { isAdmin })))
      const shown = [...html.matchAll(/<code class="tool-doc-name">([^<]+)<\/code>/g)].map((m) => m[1])
      const tools = catalogTools({ scopes: connectScopes(isAdmin, isAdmin), isAdmin }).map((t) => t.name)
      const res = catalogResources({ scopes: connectScopes(isAdmin, isAdmin), isAdmin }).map((r) => r.uri)
      expect(shown).toHaveLength(tools.length + PROMPTS.length + res.length)
      expect(new Set(shown.slice(0, tools.length))).toEqual(new Set(tools))
      expect(shown.slice(tools.length)).toEqual([...PROMPTS.map((p) => p.name), ...res])
      if (!isAdmin) expect(shown).not.toContain('review_decide')
    }
  })

  it('consent screen tool names come from the registry', () => {
    expect(toolsForScope('agora:write')).toEqual(expect.arrayContaining(['agora_post', 'network_follow', 'network_unfollow', 'network_unfriend']))
    expect(toolsForScope('feed:interact')).toEqual(['feed_comment', 'feed_like'])
  })
})
