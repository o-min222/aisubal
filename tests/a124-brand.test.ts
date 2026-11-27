import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')

describe('A124 mobile tab bar', () => {
  const src = read('src/components/shell/bottom-tabs.tsx')
  const css = read('src/app/globals.css')

  it('is icons only, with aria-label and title for each tab', () => {
    expect(src).toMatch(/aria-label=\{t\(tab\.label\)\}/)
    expect(src).toMatch(/title=\{t\(tab\.label\)\}/)
    expect(src).not.toMatch(/<span>\{t\(tab\.label\)\}<\/span>/)
  })

  it('keeps ≥44px tap targets, a filled vs outline active state, and badge-dot styles', () => {
    expect(css).toMatch(/\.bottom-tabs a \{[^}]*min-height: var\(--bottom-tabs-h\); min-width: 44px/)
    expect(css).toMatch(/\.bottom-tabs \.tab-ico-wrap \{[^}]*width: 44px; height: 44px/)
    expect(src).toMatch(/fill=\{tab\.solid && on \? 'currentColor' : 'none'\}/)
    expect(css).toMatch(/\.bottom-tabs \.tab-badge/)
    expect(css).toMatch(/padding-bottom: env\(safe-area-inset-bottom\)/)
  })

  it('stays hidden on desktop and does not change the side nav labels', () => {
    expect(src).toMatch(/className="bottom-tabs md:hidden"/)
    const side = read('src/components/shell/side-nav.tsx')
    expect(side).toMatch(/\{t\(item\.label\)\}/)
  })
})
