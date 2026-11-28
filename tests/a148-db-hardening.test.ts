import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dir = join(__dirname, '../supabase/migrations')
const sql = readFileSync(join(dir, '0160_internal_grants_fk_indexes.sql'), 'utf8')
const revokeList = sql.slice(sql.indexOf('and p.proname in ('), sql.indexOf('loop'))
const appSources = (() => {
  const out: string[] = []
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(readFileSync(p, 'utf8'))
    }
  }
  walk(join(__dirname, '../src'))
  return out.join('\n')
})()

describe('A148 0160: internal helpers, FK indexes, safe index drops', () => {
  it('never revokes a helper the app calls by name or an RLS policy needs', () => {
    for (const keep of ['app__is_admin', 'post__can_see', 'group__redirect_target', 'posts__edit', 'posts__delete', 'invites__renew_mine', 'agora__delete', 'toolbox__record_install']) {
      expect(revokeList).not.toContain(`'${keep}'`)
    }
    const called = [...appSources.matchAll(/\.rpc\(\s*'([a-z0-9_]+__[a-z0-9_]+)'/g)].map((m) => m[1])
    expect(called.length).toBeGreaterThan(0)
    for (const fn of called) expect(revokeList).not.toContain(`'${fn}'`)
  })

  it('drops only the duplicate meetups index and two retired products indexes', () => {
    const drops = [...sql.matchAll(/drop index if exists public\.([a-z_]+)/g)].map((m) => m[1])
    expect(drops.sort()).toEqual(['idx_meetups_starts_at', 'idx_product_upvotes_created', 'idx_products_featured'])
  })

  it('wraps auth.uid() in a subselect for the rec_dismissals policy', () => {
    expect(sql).toContain('(select auth.uid())')
  })
})
