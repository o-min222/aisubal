import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { SUB_SUGGESTIONS, mergeSkillOrder, moveItem, skillsPayload, sortUsage } from '@/lib/profile-stack'

const read = (p: string) => readFileSync(p, 'utf8')
const used = (id: string): It => ({ label: id.toUpperCase(), entry: { id } })
type It = { label: string; entry: { id: string } | null }
const extra = (label: string): It => ({ label, entry: null })

describe('A90 · reorder 내가 쓰는 것', () => {
  it('moveItem moves one item and ignores no-op / out-of-range moves', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    const l = ['a', 'b']
    expect(moveItem(l, 0, 0)).toBe(l)
    expect(moveItem(l, 1, 2)).toBe(l)
  })

  it('skills: saved anchors and extras keep their order; unplaced in-use tools come first; stale anchors drop', () => {
    const saved = [extra('Raycast'), { label: 'B', entry: { id: 'b' } }, { label: 'gone', entry: { id: 'gone' } }, { label: 'A', entry: { id: 'a' } }]
    const out = mergeSkillOrder(saved, [used('a'), used('b'), used('c')])
    expect(out.map((i) => i.entry?.id ?? i.label)).toEqual(['c', 'Raycast', 'b', 'a'])
    // no anchors yet (pre-A90 data): in-use tools then extras, as before
    expect(mergeSkillOrder([extra('X')], [used('a')]).map((i) => i.entry?.id ?? i.label)).toEqual(['a', 'X'])
  })

  it('skills payload: in-use tools become anchors, extras stay text; over the cap trailing anchors go first', () => {
    expect(skillsPayload([{ label: 'A', entryId: 'a', used: true }, { label: 'X', entryId: null }])).toEqual([{ label: 'A', entryId: 'a' }, { label: 'X', entryId: null }])
    const many = [{ label: 'X', entryId: null }, ...Array.from({ length: 21 }, (_, i) => ({ label: `T${i}`, entryId: `t${i}`, used: true }))]
    const p = skillsPayload(many)
    expect(p).toHaveLength(20)
    expect(p[0]).toEqual({ label: 'X', entryId: null })
  })

  it('tool_users order: not-yet-placed first (newest first), then by position', () => {
    const rows = [
      { id: 'p1', position: 1, created_at: '2026-01-03' },
      { id: 'new', position: null, created_at: '2026-01-05' },
      { id: 'p0', position: 0, created_at: '2026-01-01' },
      { id: 'old', position: null, created_at: '2026-01-02' },
    ]
    expect(sortUsage(rows).map((r) => r.id)).toEqual(['new', 'old', 'p0', 'p1'])
  })

  it('0126: position column + owner-only reorder RPC (definer, no anon), read order in listMemberTools', () => {
    const sql = read('supabase/migrations/0126_tool_users_position.sql')
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS position integer/)
    expect(sql).toMatch(/SECURITY DEFINER SET search_path = public/)
    expect(sql).toMatch(/u\.member_id = v_me/)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.member_tools_reorder\(uuid\[\]\) FROM PUBLIC, anon/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.member_tools_reorder\(uuid\[\]\) TO authenticated/)
    expect(read('src/lib/data/tools.ts')).toMatch(/\.order\('position', \{ ascending: true, nullsFirst: true \}\)/)
  })

  it('editor: chips move with ‹ › and drag; the profile list has 순서 바꾸기', () => {
    const ed = read('src/components/profile/profile-card-editor.tsx')
    expect(ed).toMatch(/useDragSort\('pe-skills'/)
    expect(ed).toMatch(/앞으로/)
    expect(ed).toMatch(/skillsPayload\(nextGroups\.skills\)/)
    expect(read('src/app/(app)/members/[id]/page.tsx')).toMatch(/<MyToolsList/)
  })
})

describe('A90 · subscription options', () => {
  it("has Claude Ultra right after Claude Max (Anthropic's plan that replaced Max 20x)", () => {
    const i = SUB_SUGGESTIONS.indexOf('Claude Max')
    expect(i).toBeGreaterThanOrEqual(0)
    expect(SUB_SUGGESTIONS[i + 1]).toBe('Claude Ultra')
  })
  it('the 추가 sheet picker is inline: every option listed, scrolls inside', () => {
    const p = read('src/components/profile/stack-editor.tsx')
    expect(p).toMatch(/slice\(0, inline \? undefined : 6\)/)
    expect(read('src/app/globals.css')).toMatch(/\.stack-pick-list \{[^}]*overflow-y: auto/)
  })
})
