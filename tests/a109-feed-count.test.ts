import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

describe('A109 first feed page skips exact count', () => {
  it('the main feed requests pages without count and uses hasMore from the payload', () => {
    const page = readFileSync('src/app/(app)/feed/page.tsx', 'utf8')
    expect(page).toMatch(/listFeedPage\([^)]*count:\s*false/)
    expect(page).toContain('hasMore={hasMore}')
    expect(page).toContain('hasMore: r.hasMore')
    expect(page).not.toMatch(/page < r\.totalPages/)
  })
  it('landing peeks are streamed behind Suspense so login can flush first', () => {
    const src = readFileSync('src/components/landing/signed-out-landing.tsx', 'utf8')
    expect(src).toContain('<Suspense fallback={<div className="auth-hero">{login}</div>}>')
    expect(src).toContain('SignedOutLandingBody')
    expect(src).toContain('await getLandingPeek')
    expect(src.indexOf('<Suspense')).toBeLessThan(src.indexOf('SignedOutLandingBody'))
  })
})
