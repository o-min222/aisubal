import { describe, expect, it } from 'vitest'
import { PUSH_OFFER_EVERY_MS, shouldOfferPush } from '@/lib/push-rules'

describe('push offer after posting (A28)', () => {
  const now = 1_800_000_000_000
  it('offers when the browser can still ask', () => {
    expect(shouldOfferPush('auto', null, now)).toBe(true)
    expect(shouldOfferPush('ask', null, now)).toBe(true)
  })
  it('never when already on, blocked, unsupported, or iOS outside the installed app', () => {
    for (const p of ['granted', 'denied', 'unsupported', 'install-first'] as const) expect(shouldOfferPush(p, null, now)).toBe(false)
  })
  it('at most once every 14 days', () => {
    expect(shouldOfferPush('auto', now - 1000, now)).toBe(false)
    expect(shouldOfferPush('auto', now - PUSH_OFFER_EVERY_MS, now)).toBe(true)
  })
})
