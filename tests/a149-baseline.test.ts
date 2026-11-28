// @vitest-environment node
/**
 * A149: supabase/baseline/0000_baseline_20261129.sql builds a fresh Postgres whose functions, grants,
 * policies, indexes, constraints, columns, triggers, RLS flags, views, default privileges, bucket config
 * and cron jobs match the prod fingerprint taken the same day (supabase/baseline/prod-fingerprint-*.json).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildFromBaseline, fingerprint, verify } from '../scripts/baseline-verify.mjs'

const BASE = 'supabase/baseline/0000_baseline_20261129.sql'

describe('A149 migration baseline', () => {
  it('a fresh DB built from the baseline matches the prod fingerprint', async () => {
    const db = await buildFromBaseline(BASE)
    const fresh = await fingerprint(db)
    const prod = JSON.parse(fs.readFileSync('supabase/baseline/prod-fingerprint-20261129.json', 'utf8'))
    const { real, equivalent } = verify(prod, fresh)
    expect(real).toEqual([])
    expect(fresh.length).toBe(prod.length)
    // only these four CHECKs differ, and only in how the deparser groups AND terms
    expect(equivalent.map((d: string[]) => d[1]).sort()).toEqual([
      'con public.agora_reactions.agora_reactions_emoji_check',
      'con public.article_series.article_series_slug_check',
      'con public.articles.articles_slug_check',
      'con public.post_reactions.post_reactions_emoji_check',
    ])
  }, 120_000)

  it('is schema only: no row data outside bucket config and cron jobs, no secrets', () => {
    const sql = fs.readFileSync(BASE, 'utf8')
    const inserts = sql.match(/^INSERT INTO [^\s]+/gm) ?? []
    expect(new Set(inserts)).toEqual(new Set(['INSERT INTO storage.buckets']))
    expect(sql).not.toMatch(/^COPY /m)
    expect(sql).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}|sk_(live|test)_|service_role_key|Bearer [A-Za-z0-9._-]{20,}/)
  })

  it('migrations stay in place: tests and docs read supabase/migrations directly', () => {
    expect(fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).length).toBeGreaterThanOrEqual(161)
  })
})
