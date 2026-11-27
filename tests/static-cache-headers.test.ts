import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FONT_ICON_CACHE_CONTROL, STATIC_ASSET_CACHE_HEADERS, SW_CACHE_CONTROL } from '@/lib/static-cache-headers'

describe('A109 static asset cache headers', () => {
  it('long-caches fonts and icons, keeps the service worker no-cache', () => {
    const bySource = Object.fromEntries(STATIC_ASSET_CACHE_HEADERS.map((r) => [r.source, r.headers[0]?.value]))
    expect(bySource['/fonts/:path*']).toBe(FONT_ICON_CACHE_CONTROL)
    expect(bySource['/icons/:path*']).toBe(FONT_ICON_CACHE_CONTROL)
    expect(bySource['/sw.js']).toBe(SW_CACHE_CONTROL)
    expect(FONT_ICON_CACHE_CONTROL).toMatch(/max-age=2592000/)
    expect(FONT_ICON_CACHE_CONTROL).toMatch(/stale-while-revalidate=31536000/)
    expect(FONT_ICON_CACHE_CONTROL).not.toMatch(/immutable/)
    expect(SW_CACHE_CONTROL).toMatch(/max-age=0/)
    expect(SW_CACHE_CONTROL).toMatch(/must-revalidate/)
  })
  it('is wired into next.config headers()', () => {
    const src = readFileSync('next.config.ts', 'utf8')
    expect(src).toContain('STATIC_ASSET_CACHE_HEADERS')
    expect(src).toContain('SECURITY_HEADERS')
  })
})
