import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (f: string) => readFileSync(f, 'utf8')
const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'

describe('A11 notification layer popup', () => {
  it('the bell opens a non-modal popover (no backdrop) that closes on outside click / Esc', () => {
    const s = read('src/components/notifications/notification-bell.tsx')
    expect(s).toContain('aria-haspopup="dialog"')
    expect(s).toMatch(/e\.key === 'Escape'/)
    expect(s).toMatch(/addEventListener\('pointerdown'/)
    expect(s).not.toMatch(/AdaptiveSheet|<Dialog|className="[^"]*backdrop/)
    expect(s).toContain('/api/notifications/read') // mark read on open
    expect(s).toContain('href="/notifications"') // full page stays as fallback
  })
  it('phones get a full-width dropdown under the top bar', () => {
    expect(read('src/app/globals.css')).toMatch(/@media \(max-width: 639px\) \{\s*\.notif-wrap \{ position: static; \}\s*\.notif-pop \{\s*position: fixed; left: 0; right: 0;/)
  })
  it('/notifications is an infinite list (no numbered pages)', async () => {
    const page = read('src/app/(app)/notifications/page.tsx')
    expect(page).toContain('<InfiniteList')
    expect(page).not.toContain('Pagination')
    const res = await fetch(`${BASE_URL}/notifications`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('inf-list')
  })
})
