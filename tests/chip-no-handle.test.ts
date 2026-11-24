import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A96 · no drag handle on profile chips, icon-only add chips', () => {
  const ed = read('src/components/profile/profile-card-editor.tsx')
  const css = read('src/app/globals.css')
  it('no grip on any reorderable chip; the whole chip is still the drag target', () => {
    expect(ed).not.toMatch(/GripVertical|pe-grip/)
    expect(css).not.toMatch(/\.pe-grip/)
    expect((ed.match(/useDragSort\(/g) ?? []).length).toBe(4)
    expect(css).toMatch(/\.mc-chips li\[data-sort-list\] \{ cursor: grab; \}/)
  })
  it('every add chip is a dashed + with an aria-label and no visible text', () => {
    const adds = ed.match(/<button[^>]*className="mc-chip pe-add"[^>]*>[\s\S]*?<\/button>/g) ?? []
    expect(adds.length).toBe(2) // the three stack groups share one in a loop, plus SNS
    for (const a of adds) {
      expect(a).toMatch(/aria-label=\{tx\(/)
      expect(a).toContain('<Plus')
      expect(a).not.toContain('<T>추가</T>')
    }
    expect(css).toMatch(/\.mc-chips \.pe-add \{ width: 24px;/)
  })
})
