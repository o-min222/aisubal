import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(__dirname, '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const pngSize = (p: string) => {
  const b = readFileSync(join(root, p))
  expect(b.subarray(1, 4).toString()).toBe('PNG')
  return [b.readUInt32BE(16), b.readUInt32BE(20)] as const
}

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

describe('A124 brand assets', () => {
  it('has one SVG source for the mark and the wordmark', () => {
    expect(existsSync(join(root, 'brand/mark.svg'))).toBe(true)
    expect(existsSync(join(root, 'brand/wordmark.svg'))).toBe(true)
    expect(read('brand/wordmark.svg')).toMatch(/aria-label="AI쓰발"/)
    expect(read('src/components/logo.tsx')).toMatch(/from '@\/brand\/logo-paths'/)
  })

  it('regenerates every icon size used in the manifest, favicon, apple, push badge, and OG card', () => {
    expect(pngSize('public/favicon.png')).toEqual([32, 32])
    expect(pngSize('public/icons/icon-192.png')).toEqual([192, 192])
    expect(pngSize('public/icons/icon-512.png')).toEqual([512, 512])
    expect(pngSize('public/icons/icon-maskable-512.png')).toEqual([512, 512])
    expect(pngSize('public/icons/apple-touch-icon.png')).toEqual([180, 180])
    expect(pngSize('public/icons/badge.png')).toEqual([96, 96])
    expect(pngSize('public/images/og-default.png')).toEqual([1200, 630])
    expect(existsSync(join(root, 'public/favicon.svg'))).toBe(true)
  })

  it('wires the new favicon and the push badge into layout and the service worker', () => {
    expect(read('src/app/layout.tsx')).toMatch(/\/favicon\.svg/)
    expect(read('public/sw.js')).toMatch(/badge: '\/icons\/badge\.png'/)
    expect(read('src/app/manifest.ts')).toMatch(/\/icons\/icon-192\.png/)
  })
})
