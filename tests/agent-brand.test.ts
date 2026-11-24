import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_PATTERNS, CLIENT_BRAND, brandFromText, parseBrand, resolveAgentBrand } from '@/lib/agent-brand'

// A69 (Colin, t295u): 소연이 showed a Claude mark on one surface and the generic bot on /agents,
// because every surface guessed the mark from a different field. The database now resolves one
// api_tokens.agent_brand (0122) and every surface renders <AgentAvatar brand=…>.
const root = join(__dirname, '..')
const sql = readFileSync(join(root, 'supabase/migrations/0122_agent_avatars.sql'), 'utf8')

describe('agent brand', () => {
  it('the TS patterns are the SQL patterns, in the same order', () => {
    const body = sql.slice(sql.indexOf('function public.agent__brand_from_text'), sql.indexOf('$$;', sql.indexOf('function public.agent__brand_from_text')))
    const fromSql = [...body.matchAll(/when p ~\* '([^']+)' then '([a-z_]+)'/g)].map((m) => [m[2], m[1]])
    expect(fromSql).toEqual(BRAND_PATTERNS.map(([b, p]) => [b, p]))
  })

  it('the connect presets map the same way in SQL', () => {
    for (const [client, brand] of Object.entries(CLIENT_BRAND)) expect(sql).toContain(`when '${client}' then '${brand}'`)
  })

  it('소연이 (OAuth "Orca", clientInfo claude-code) is Claude; 쓰발이 is Grok Bot', () => {
    expect(resolveAgentBrand({ model: null, client: null, oauthSoftwareId: null, oauthClientName: 'Orca', clientInfo: 'claude-code 2.1.322' })).toBe('claude')
    expect(resolveAgentBrand({ model: 'Grok Bot', client: 'grok_bot', clientInfo: 'Cursor 1.0.0' })).toBe('grok_bot')
  })

  it('model beats client beats clientInfo; unknown is null', () => {
    expect(resolveAgentBrand({ model: 'gpt-5', client: 'cursor', clientInfo: 'claude-code' })).toBe('chatgpt')
    expect(resolveAgentBrand({ model: null, client: 'cursor', clientInfo: 'claude-code' })).toBe('cursor')
    expect(brandFromText('grok-bot 1.2')).toBe('grok_bot')
    expect(brandFromText('Grok 4')).toBe('grok')
    expect(brandFromText('my-own-agent')).toBeNull()
    expect(parseBrand('claude')).toBe('claude')
    expect(parseBrand('<script>')).toBeNull()
  })

  it('every <AgentAvatar> / <AgentClientIcon> / <AgentAttribution> passes brand', () => {
    const files: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (p.endsWith('.tsx')) files.push(p)
      }
    }
    walk(join(root, 'src'))
    const missing: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      for (const m of src.matchAll(/<(AgentAvatar|AgentClientIcon|AgentAttribution)\b([^>]*?)\/>/g)) {
        if (!/\bbrand=/.test(m[2])) missing.push(`${f.slice(root.length + 1)}: ${m[0].slice(0, 80)}`)
      }
    }
    expect(missing).toEqual([])
  })
})
