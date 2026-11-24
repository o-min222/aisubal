import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// AI-6 (Colin, t293u): a newly connected agent is public (shown on the profile) by default — wizard,
// 토큰만 직접 만들기 and OAuth consent alike. 0120 reversed 0037's opt-in default for new rows only.
const root = join(__dirname, '..')
const dir = join(root, 'supabase', 'migrations')
const migrations = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort().map((f) => readFileSync(join(dir, f), 'utf8'))

describe('new agents are public by default', () => {
  it('the latest show_on_profile column default is true', () => {
    const defaults = migrations.flatMap((s) => [...s.matchAll(/show_on_profile\s+(?:boolean\s+not\s+null\s+)?(?:set\s+)?default\s+(true|false)/gi)].map((m) => m[1].toLowerCase()))
    expect(defaults.at(-1)).toBe('true')
  })

  it('the latest oauth_token_exchange inserts new agents with show_on_profile true', () => {
    const last = migrations.filter((s) => s.includes('function public.oauth_token_exchange(')).at(-1)!
    const fn = last.slice(last.indexOf('function public.oauth_token_exchange('))
    const insert = fn.match(/insert into public\.api_tokens \(([^)]*)\)\s*values \(([\s\S]*?)\)\s*returning id into v_tid/)
    expect(insert, 'new-agent insert not found').toBeTruthy()
    const cols = insert![1].split(',').map((c) => c.trim())
    expect(cols.at(-1)).toBe('show_on_profile')
    expect(insert![2].trim()).toMatch(/,\s*true$/)
  })

  it('issueApiToken (wizard + token-only) inserts show_on_profile: true', () => {
    const src = readFileSync(join(root, 'src', 'lib', 'data', 'tokens.ts'), 'utf8')
    const fn = src.slice(src.indexOf('export async function issueApiToken'))
    expect(fn.slice(0, fn.indexOf('.select(TOKEN_COLS)'))).toMatch(/show_on_profile: true/)
  })
})
