import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { badgeTierLabel } from '@/lib/badges'

const sql = readFileSync('supabase/migrations/0089_member_titles.sql', 'utf8')

describe('A37 titles by join order', () => {
  it('1..10 are 창립멤버, 11..100 are 초기멤버', () => {
    expect(sql).toContain("select 'founder', (select case when m.pledge_no between 1 and 10 then")
    expect(sql).toContain("select 'early', (select case when m.pledge_no between 11 and 100 then")
    expect(badgeTierLabel('founder', 1)).toBe('창립멤버')
    expect(badgeTierLabel('early', 1)).toBe('초기멤버')
  })
  it('backfill removes titles that no longer match and awards quietly', () => {
    expect(sql).toMatch(/badge = 'founder' and not coalesce\(m\.pledge_no between 1 and 10, false\)/)
    expect(sql).toMatch(/badges__award\(r\.id, false\)/)
  })
})
