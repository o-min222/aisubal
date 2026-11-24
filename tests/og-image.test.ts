import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// AI-8: KakaoTalk showed an empty image box for shared links — no og:image anywhere.
const root = join(__dirname, '..')

describe('share card', () => {
  it('public/images/og-default.png is a 1200×630 PNG', () => {
    const b = readFileSync(join(root, 'public', 'images', 'og-default.png'))
    expect(b.subarray(1, 4).toString()).toBe('PNG')
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630])
  })

  it('every page that sets its own openGraph also lists an image (a page openGraph replaces the layout one)', () => {
    for (const p of ['src/app/layout.tsx', 'src/app/page.tsx', 'src/app/join/page.tsx', 'src/app/t/[slug]/page.tsx', 'src/app/i/[code]/page.tsx']) {
      const src = readFileSync(join(root, p), 'utf8')
      for (const m of src.matchAll(/openGraph: \{([^}]*)\}/g)) expect(m[1], p).toMatch(/images:/)
    }
  })
})
