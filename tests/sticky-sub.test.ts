import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const css = readFileSync(join(root, 'src/app/globals.css'), 'utf8')
const rule = (sel: string) => {
  const i = css.indexOf(`${sel} {`)
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i))
}

describe('A83 sticky sub-header is one opaque block that follows the mobile top bar', () => {
  it('opaque page colour, full width, above the list, with a bottom edge', () => {
    const r = rule('  .sticky-sub')
    expect(r).toMatch(/position: sticky/)
    expect(r).toMatch(/background: var\(--n-f4f4f2\)/)
    expect(r).toMatch(/border-bottom: 1px solid/)
    expect(r).toMatch(/margin: 0 -10px/)
    expect(r).toMatch(/z-index: 30/)
  })

  it('moves up when the top bar hides (no see-through band)', () => {
    expect(rule('  html[data-topbar-hidden] .sticky-sub')).toMatch(/top: env\(safe-area-inset-top/)
    expect(readFileSync(join(root, 'src/components/shell/top-bar.tsx'), 'utf8')).toContain("toggleAttribute('data-topbar-hidden', hidden)")
  })

  it('gallery (A85): search + category tabs are sticky; the sort sits in the list header, not on the tab row', () => {
    const page = readFileSync(join(root, 'src/app/(app)/gallery/page.tsx'), 'utf8')
    const start = page.indexOf('<div className="sticky-sub gallery-controls"')
    expect(start).toBeGreaterThan(0)
    const search = page.indexOf('<ToolSearch', start)
    const bar = page.indexOf('<div className="gallery-bar">', start)
    const head = page.indexOf('<div className="gallery-listhead">', start)
    const sort = page.indexOf('<GallerySort', start)
    expect(search).toBeGreaterThan(start)
    expect(bar).toBeGreaterThan(search)
    expect(head).toBeGreaterThan(bar)
    expect(sort).toBeGreaterThan(head)
    expect(page.slice(bar, head)).not.toContain('GallerySort')
    expect(page).not.toMatch(/ChipBar|className="seg"|anon-toolbar/)
  })
})
