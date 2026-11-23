import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { STACK_SIZE, usageLine, usageStacks } from '@/lib/tool-usage-rules'
import { parseToolSort, sortTools, TOOL_SORTS } from '@/lib/tool-rules'
import type { ToolboxEntry } from '@/lib/supabase/types'

const row = (entry_id: string, member_id: string) => ({ entry_id, member_id, name: member_id, avatarUrl: null })

describe("G1 '나도 써요' on gallery rows", () => {
  it('stacks up to 3 faces: friends, then people I follow, then others, me last', () => {
    const rows = [row('t1', 'me'), row('t1', 'o1'), row('t1', 'f1'), row('t1', 'g1'), row('t1', 'o2'), row('t1', 'f2')]
    const s = usageStacks(rows, 'me', new Set(['f1', 'f2']), new Set(['g1']))
    const t1 = s.get('t1')!
    expect(t1.stack.map((u) => u.id)).toEqual(['f1', 'f2', 'g1'])
    expect(t1.stack).toHaveLength(STACK_SIZE)
    expect(t1).toMatchObject({ friends: 2, following: 1 })
    // only me → my own face, and the line falls back to the total
    const solo = usageStacks([row('t2', 'me')], 'me', new Set(), new Set()).get('t2')!
    expect(solo.stack.map((u) => u.id)).toEqual(['me'])
    expect(usageLine(solo, 1)).toEqual({ s: '{n}명이 써요', vars: { n: 1 } })
  })

  it('says friends first, then followings, else the total (which counts private marks)', () => {
    expect(usageLine({ stack: [], friends: 2, following: 5 }, 9)).toEqual({ s: '친구 {n}명이 써요', vars: { n: 2 } })
    expect(usageLine({ stack: [], friends: 0, following: 5 }, 9)).toEqual({ s: '팔로잉 {n}명이 써요', vars: { n: 5 } })
    expect(usageLine(undefined, 4)).toEqual({ s: '{n}명이 써요', vars: { n: 4 } })
    expect(usageLine(undefined, 0)).toBeNull()
  })

  it("adds a '많이 쓰는' sort by member count", () => {
    expect(TOOL_SORTS.map((s) => s.id)).toContain('users')
    expect(parseToolSort('users')).toBe('users')
    const e = (id: string, user_count: number, mention_count = 0) => ({ id, user_count, mention_count, install_count: 0, upvote_count: 0, avg_rating: 0, rating_count: 0, created_at: '2026-01-01', launched_at: null }) as unknown as ToolboxEntry
    expect(sortTools([e('a', 1, 50), e('b', 3), e('c', 2)], 'users').map((x) => x.id)).toEqual(['b', 'c', 'a'])
  })

  it('keeps privacy in the database: RLS hides marks by visibility, counts stay totals, MCP installs mark usage', () => {
    const sql = readFileSync('supabase/migrations/0077_tool_usage_visibility.sql', 'utf8')
    expect(sql).toMatch(/CREATE POLICY tool_users_select[\s\S]*tool_usage__visible_to\(\(SELECT public\.current_member_id\(\)\), member_id\)/)
    expect(sql).toMatch(/IF p_via = 'mcp' THEN\s+INSERT INTO public\.tool_users/)
    expect(sql).toMatch(/public\.tool_usage__visible_to\(t\.member_id, x\.member_id\)/)
    const data = readFileSync('src/lib/data/tools.ts', 'utf8')
    expect(data).not.toMatch(/from\('tool_users'\)\.select\('entry_id', \{ count: 'exact'/)
  })
})
