import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const css = read('src/app/globals.css')
const block = css.slice(css.indexOf('A141: motion.'))

describe('A141 · motion', () => {
  it('only animates transform and opacity in the new block', () => {
    const keyframes = [...block.matchAll(/@keyframes [\w-]+ \{([^@]*?\}) \}/g)].map((m) => m[1])
    expect(keyframes.length).toBeGreaterThanOrEqual(4)
    for (const k of keyframes) expect(k).not.toMatch(/\b(width|height|top|left|margin|padding|box-shadow|background)/)
  })
  it('turns every animation and transition off under prefers-reduced-motion', () => {
    const rm = block.slice(block.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
    expect(rm).toContain('animation-duration: .01ms !important')
    expect(rm).toContain('transition-duration: .01ms !important')
  })
  it('slides the 사람|AI pill from the route, with a data-mode hook', () => {
    expect(read('src/components/shell/mode-switch.tsx')).toContain("data-mode={ai ? 'ai' : human ? 'human' : undefined}")
    expect(css).toContain('.mode-switch[data-mode="ai"]::before')
    expect(css).toContain('translateX(100%)')
  })
  it('pops the heart only after a click that likes', () => {
    for (const f of ['src/components/timeline/like-button.tsx', 'src/components/articles/article-actions.tsx']) {
      const s = read(f)
      expect(s).toContain('if (next) setPop(')
      expect(s).toContain("pop > 0 && liked ? ' heart-pop'")
    }
  })
  it('pops a reaction chip only when the click turns it on', () => {
    const s = read('src/components/timeline/reactions.tsx')
    expect(s).toContain('if (!r.mine) setPop(')
    expect(s).toContain("pop > 0 && r.mine ? ' heart-pop'")
  })
  it('keeps the logo out of it', () => {
    expect(block).not.toMatch(/logo|brand/i)
  })
})
