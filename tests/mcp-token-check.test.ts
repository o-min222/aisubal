import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A133 · mcp_token_check tests the token id, not the composite row', () => {
  it('0151 uses (api__find_token(...)).id is not null', () => {
    const sql = read('supabase/migrations/0151_mcp_token_check.sql')
    expect(sql).toContain('(public.api__find_token(p_token)).id is not null')
    expect(sql).toMatch(/select \(public\.api__find_token\(p_token\)\)\.id is not null/)
  })

  it('tools/call still goes through tokenUsable → mcp_token_check', () => {
    expect(read('src/lib/data/oauth.ts')).toContain("rpc('mcp_token_check', { p_token: token })")
    expect(read('src/app/api/mcp/route.ts')).toContain('tokenUsable(bearer)')
  })
})
