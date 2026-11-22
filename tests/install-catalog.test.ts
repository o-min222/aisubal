import { describe, expect, it } from 'vitest'
import { VERIFIED_INSTALLS, installAnswer, renderableInstall, verifiedSnippets } from '@/lib/install-catalog'
import { MUTABLE_TOOLBOX } from '@/lib/mock-toolbox'

// Packages / URLs confirmed on npm, PyPI and the official READMEs (QA B-1, 2026-11-22).
const ALLOWED = [
  '@brave/brave-search-mcp-server', 'chrome-devtools-mcp@latest', 'firecrawl-mcp', '@playwright/mcp@latest',
  '@modelcontextprotocol/server', '@modelcontextprotocol/client', 'aider-install', '@anthropic-ai/claude-code',
  '@google/gemini-cli', 'gemini-cli', '@openai/codex', 'codex', 'dspy', 'create-next-app@latest', 'ai',
]

describe('gallery install commands (B-1 security)', () => {
  const all = Object.keys(VERIFIED_INSTALLS).map((slug) => [slug, verifiedSnippets(slug)!] as const)

  it('never contains slug-derived package guesses', () => {
    for (const [slug, v] of all) {
      const text = Object.values(v.snippets).join('\n')
      expect(text, slug).not.toMatch(/(?:npx|npm (?:i|install))(?: -[gy])* @[a-z0-9]+-[a-z0-9.-]+(?:\s|$)/m)
      expect(text, slug).not.toMatch(/pip install [a-z]+ [a-z]+/)
    }
  })

  it('only installs allow-listed packages', () => {
    for (const [slug, v] of all) {
      for (const line of Object.values(v.snippets).join('\n').split('\n')) {
        const m = line.match(/(?:npm (?:install|i)(?: -g)?|npx(?: -y)?|pip install|brew install(?: --cask)?)\s+([^\s"]+)/)
        if (m) expect(ALLOWED, `${slug}: ${line}`).toContain(m[1])
      }
    }
  })

  it('renders nothing unless verified, and no copied fallback tabs', () => {
    expect(renderableInstall({ install_verified: false, install_snippets: { generic: 'npm i -g x' } }).tabs).toEqual([])
    expect(renderableInstall({ install_verified: true, install_snippets: { generic: 'pip install dspy' } }).tabs).toEqual(['generic'])
    const mcp = renderableInstall({ install_verified: true, install_snippets: verifiedSnippets('playwright-mcp')!.snippets })
    expect(mcp.tabs).toContain('claude_code')
    expect(new Set(mcp.tabs.map((t) => mcp.snippets[t])).size).toBe(mcp.tabs.length) // each tab is its own config
  })

  it('API answers fall back to the official link, not a fake command', () => {
    const a = installAnswer({ name: 'X', canonical_url: 'https://github.com/a/b', install_verified: false, install_snippets: { cursor: 'npx -y @a-b' } }, 'cursor')
    expect(a.snippet).toBeNull()
    expect(a.note).toContain('https://github.com/a/b')
    const b = installAnswer({ name: 'O', canonical_url: 'https://github.com/ollama/ollama', install_verified: true, install_snippets: verifiedSnippets('ollama')!.snippets }, 'cursor')
    expect(b.environment).toBe('generic')
    expect(b.snippet).toContain('ollama.com/install.sh')
  })

  it('mock catalog carries only catalog commands', () => {
    for (const e of MUTABLE_TOOLBOX) {
      // either nothing (runtime-created / unverified) or exactly the verified catalog entry
      if (Object.keys(e.install_snippets).length) expect(e.install_snippets, e.slug).toEqual(verifiedSnippets(e.slug)?.snippets)
    }
  })
})
