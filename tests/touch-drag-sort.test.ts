import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { LONG_PRESS_MS } from '@/hooks/use-drag-sort'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A94 · touch drag and drop instead of arrows', () => {
  it('touch: a ~250ms long-press lifts; moving first is a scroll; lifted blocks scrolling, vibrates, auto-scrolls', () => {
    expect(LONG_PRESS_MS).toBe(250)
    const h = read('src/hooks/use-drag-sort.ts')
    // hit test on layout slots, not on chips mid-FLIP
    expect(h).toMatch(/const hit = slotAt\(s, me\)/)
    expect(h).toContain('new DOMMatrixReadOnly(t)')
    expect(h).toMatch(/if \(Math\.hypot\(t\.clientX - s\.x, t\.clientY - s\.y\) > TOUCH_SLOP\) end\(false\)/)
    expect(h).toContain("document.addEventListener('touchmove', tmove, { passive: false })")
    expect(h).toContain('e.preventDefault() // lifted: the page must not scroll under the finger')
    expect(h).toContain('navigator.vibrate?.(12)')
    expect(h).toContain('window.scrollBy(0, ')
    // FLIP for the others, the lifted one follows the pointer, keyboard arrows move a focused item
    expect(h).toContain("e.style.transition = 'transform 160ms ease'")
    expect(h).toMatch(/translate\(\$\{s\.px - s\.gx - r\.left\}px/)
    expect(h).toMatch(/e\.key === 'ArrowLeft' \|\| e\.key === 'ArrowUp'/)
  })

  it('every chip row in the editor sorts (AI, 구독, 스킬, SNS) and none has arrow buttons', () => {
    const ed = read('src/components/profile/profile-card-editor.tsx')
    for (const l of ['pe-ai', 'pe-subs', 'pe-skills', 'pe-links']) expect(ed).toContain(`useDragSort('${l}'`)
    expect(ed).not.toMatch(/ChevronLeft|pe-chip-move/)
    expect(ed).toContain("key={`${l.kind}-${l.url}`}") // stable keys: the lifted node survives reorders
    const tools = read('src/components/profile/my-tools-list.tsx')
    expect(tools).not.toMatch(/<ArrowUp|<ArrowDown|my-tool-steps|data-sort-handle/)
  })

  it('CSS: lifted shadow, no long-press callout, the armed chip shows the whole name', () => {
    const css = read('src/app/globals.css')
    expect(css).toMatch(/\[data-sort-list\] \{ -webkit-touch-callout: none;/)
    expect(css).toMatch(/\[data-sort-list\]\[data-lifted\] \{[^}]*pointer-events: none/)
    expect(css).toMatch(/\.pe-chip\.on \.svc-label \{ overflow: visible/)
    expect(css).not.toMatch(/\.pe-chip-move \{|\.my-tool-steps \{/)
  })
})
