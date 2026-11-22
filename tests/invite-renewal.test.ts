import { describe, expect, it } from 'vitest'
import { addOneMonth, hasDueRenewal, renewsAt } from '@/lib/invite-renewal'

describe('invite auto-renewal dates', () => {
  it('adds one calendar month, clamped to month end like Postgres', () => {
    expect(addOneMonth('2026-01-31T10:00:00Z').toISOString()).toBe('2026-02-28T10:00:00.000Z')
    expect(addOneMonth('2026-11-23T00:00:00Z').toISOString()).toBe('2026-12-23T00:00:00.000Z')
    expect(addOneMonth('2026-12-15T05:00:00Z').toISOString()).toBe('2027-01-15T05:00:00.000Z')
  })
  it('only used, not-yet-renewed codes renew', () => {
    expect(renewsAt({ usedAt: null, renewedAt: null })).toBeNull()
    expect(renewsAt({ usedAt: '2026-10-01T00:00:00Z', renewedAt: '2026-11-02T00:00:00Z' })).toBeNull()
    expect(renewsAt({ usedAt: '2026-10-01T00:00:00Z', renewedAt: null })).toBe('2026-11-01T00:00:00.000Z')
  })
  it('due only after the month has passed', () => {
    const now = Date.parse('2026-11-23T00:00:00Z')
    expect(hasDueRenewal([{ usedAt: '2026-11-01T00:00:00Z', renewedAt: null }], now)).toBe(false)
    expect(hasDueRenewal([{ usedAt: '2026-10-22T00:00:00Z', renewedAt: null }], now)).toBe(true)
    expect(hasDueRenewal([{ usedAt: null, renewedAt: null }, { usedAt: '2026-01-01T00:00:00Z', renewedAt: '2026-02-01T00:00:00Z' }], now)).toBe(false)
  })
})
