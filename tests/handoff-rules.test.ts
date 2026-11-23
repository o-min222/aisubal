import { describe, expect, it } from 'vitest'
import { detectPlatform, handoffUrl, hashHandoffToken, isHandoffToken, newHandoffToken, safeNextPath, tokenFromFragment } from '@/lib/handoff-rules'

describe('handoff tokens', () => {
  it('are 256-bit base64url and unique', () => {
    const a = newHandoffToken(), b = newHandoffToken()
    expect(isHandoffToken(a)).toBe(true)
    expect(a).not.toBe(b)
  })
  it('hash to 64 hex chars (what the DB accepts)', async () => {
    expect(await hashHandoffToken('x')).toBe('2d711642b726b04401627ca9fbac32f5c8530fb1903cc4db02258717921a4881')
  })
  it('ride in the fragment, never the path or query', () => {
    const t = newHandoffToken()
    const u = new URL(handoffUrl('https://aisubal.vercel.app', t))
    expect(u.pathname).toBe('/h')
    expect(u.search).toBe('')
    expect(tokenFromFragment(u.hash)).toBe(t)
    expect(tokenFromFragment('#short')).toBeNull()
  })
  it('only same-origin next paths', () => {
    expect(safeNextPath('/h')).toBe('/h')
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '', null]) expect(safeNextPath(bad)).toBeNull()
  })
  it('picks the install path per browser', () => {
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    const android = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'
    const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'
    expect(detectPlatform(iphone, { standalone: false, touch: true })).toBe('ios')
    expect(detectPlatform(mac, { standalone: false, touch: true })).toBe('ios') // iPadOS
    expect(detectPlatform(mac, { standalone: false, touch: false })).toBe('desktop')
    expect(detectPlatform(android, { standalone: false, touch: true })).toBe('android')
    expect(detectPlatform(android, { standalone: true, touch: true })).toBe('standalone')
  })
})
