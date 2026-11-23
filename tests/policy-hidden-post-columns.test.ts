import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Members can't SELECT these posts columns (column grants). A policy on ANOTHER table that reads them
// through a posts subquery is checked as the caller and fails with "permission denied for table posts"
// for every row, which took down every post page until 0079 (P0, 2026-11-23). Ask a definer helper
// such as post_is_mine() instead. Policies ON posts itself are fine: Postgres doesn't column-check them.
const HIDDEN = ['author_id', 'nickname_profile_id', 'agent_token_name']

function finalPolicies(): Map<string, { table: string; body: string; file: string }> {
  const dir = join(__dirname, '..', 'supabase', 'migrations')
  const live = new Map<string, { table: string; body: string; file: string }>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    const sql = readFileSync(join(dir, file), 'utf8').replace(/--[^\n]*/g, '')
    const re = /\b(create|drop)\s+policy\s+(?:if\s+exists\s+)?("[^"]+"|\w+)\s+on\s+([\w."]+)([^;]*);/gi
    for (const m of sql.matchAll(re)) {
      const table = m[3].replace(/"/g, '').replace(/^public\./, '')
      const key = `${table}:${m[2].replace(/"/g, '')}`
      if (m[1].toLowerCase() === 'drop') live.delete(key)
      else live.set(key, { table, body: m[4], file })
    }
  }
  return live
}

describe('RLS policies never read hidden posts columns from another table', () => {
  it('replays the migrations and finds no such policy', () => {
    const policies = finalPolicies()
    expect(policies.size).toBeGreaterThan(20)
    const hidden = new RegExp(`(?<![\\w])(?:\\w+\\.)?(${HIDDEN.join('|')})\\b`, 'i')
    const offenders = [...policies]
      .filter(([, p]) => p.table !== 'posts' && /\bposts\b/i.test(p.body))
      .filter(([, p]) => hidden.test(p.body.replace(/public_author_id/gi, '')))
      .map(([k, p]) => `${k} (${p.file})`)
    expect(offenders).toEqual([])
  })
})
