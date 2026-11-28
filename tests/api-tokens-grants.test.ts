import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// api_tokens is read with column-level SELECT grants (0011 revokes the table). Selecting or filtering on a
// column without one fails the WHOLE query: 0115 added oauth_client_id / access_expires_at without a grant,
// TOKEN_COLS read oauth_client_id, and 내 에이전트 showed "no agents" until 0118 (AI-7, 2026-11-24).
// The granted set is rebuilt from the migrations, so a new column needs its grant in the same change.
const root = join(__dirname, '..')
const migrations = readdirSync(join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort()

function grantedSelect(): Set<string> {
  const out = new Set<string>()
  for (const f of migrations) {
    const sql = readFileSync(join(root, 'supabase', 'migrations', f), 'utf8').replace(/--.*$/gm, '')
    for (const m of sql.matchAll(/grant\s+select\s*\(([^)]*)\)\s*on\s+(?:table\s+)?public\.api_tokens\s+to\s+([^;]+);/gi)) {
      if (!/\bauthenticated\b/i.test(m[2])) continue
      for (const c of m[1].split(',')) out.add(c.trim().toLowerCase())
    }
  }
  return out
}

const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('api_tokens reads only use columns members may SELECT', () => {
  const granted = grantedSelect()

  it('the migrations grant the base columns (sanity)', () => {
    for (const c of ['id', 'member_id', 'name', 'scopes', 'is_revoked']) expect(granted.has(c), c).toBe(true)
    expect(granted.has('token_hash')).toBe(false)
  })

  it('TOKEN_COLS (listApiTokens / 내 에이전트)', () => {
    const m = read('src/lib/data/tokens.ts').match(/const TOKEN_COLS =\s*'([^']+)'/)
    expect(m, 'TOKEN_COLS not found').toBeTruthy()
    const cols = m![1].split(',').map((c) => c.trim())
    expect(cols.length).toBeGreaterThan(10)
    expect(cols.filter((c) => !granted.has(c))).toEqual([])
  })

  it('myOAuthAgents (OAuth consent: reconnect list) goes through the closed-table-safe RPC, not the api_tokens columns', () => {
    const src = read('src/lib/data/oauth.ts')
    const fn = src.slice(src.indexOf('export async function myOAuthAgents'))
    expect(fn.slice(0, fn.indexOf('export async function createCode'))).toContain("rpc('oauth_my_agents'")
    const sql = read('supabase/migrations/0158_oauth_article_scope.sql')
    expect(sql).toMatch(/revoke all on function public\.oauth_my_agents\(text\) from public, anon;/)
    expect(sql).toMatch(/grant execute on function public\.oauth_my_agents\(text\) to authenticated;/)
  })
})
