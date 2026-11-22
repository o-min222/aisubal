import { describe, expect, it } from 'vitest'
import { cleanSnippets, filterQueue, parseInstallQueue, snippetsFromMcp, SNIPPET_MAX } from '@/lib/install-admin'

describe('admin install confirmation', () => {
  it('keeps known environments with text, drops blanks, rejects unknown/long', () => {
    expect(cleanSnippets({ generic: 'npx -y x', cursor: '   ' })).toEqual({ snippets: { generic: 'npx -y x' }, error: null })
    expect(cleanSnippets({ bash: 'x' }).error).toBe('env')
    expect(cleanSnippets({ generic: 'x'.repeat(SNIPPET_MAX + 1) }).error).toBe('long')
  })
  it('builds every environment from a package or remote URL, refuses junk', () => {
    const s = snippetsFromMcp('npx', '@brave/brave-search-mcp-server', 'brave-search-mcp')!
    expect(s.claude_code).toContain('npx -y @brave/brave-search-mcp-server')
    expect(s.cursor).toContain('mcpServers')
    expect(snippetsFromMcp('npx', 'rm -rf /', 'x')).toBeNull()
    expect(snippetsFromMcp('remote', 'http://insecure', 'x')).toBeNull()
    expect(snippetsFromMcp('remote', 'https://mcp.context7.com/mcp', 'context7')!.claude_code).toContain('--transport http')
  })
  it('parses the queue and filters by state and name', () => {
    const q = parseInstallQueue([
      { id: 'a', slug: 'context7', name: 'Context7', verified: false, snippets: {}, canonicalUrl: 'https://context7.com' },
      { id: 'b', slug: 'zzz', name: 'Zed', verified: true, snippets: { generic: 'x' }, canonicalUrl: 'https://z.dev' },
      { bogus: true },
    ])
    expect(q).toHaveLength(2)
    expect(q[0].catalog).not.toBeNull() // context7 is in the checked-in verified catalog
    expect(filterQueue(q, 'todo', '').map((i) => i.id)).toEqual(['a'])
    expect(filterQueue(q, 'verified', '').map((i) => i.id)).toEqual(['b'])
    expect(filterQueue(q, 'all', 'ze').map((i) => i.id)).toEqual(['b'])
  })
})
