import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { INVITE_RENEWAL_DAYS, addRenewalPeriod, hasDueRenewal, renewsAt } from '@/lib/invite-renewal'

describe('invite auto-renewal dates (7 days)', () => {
  it('adds 7 days', () => {
    expect(INVITE_RENEWAL_DAYS).toBe(7)
    expect(addRenewalPeriod('2026-11-23T00:00:00Z').toISOString()).toBe('2026-11-30T00:00:00.000Z')
    expect(addRenewalPeriod('2026-12-28T05:00:00Z').toISOString()).toBe('2027-01-04T05:00:00.000Z')
  })
  it('only used, not-yet-renewed codes renew', () => {
    expect(renewsAt({ usedAt: null, renewedAt: null })).toBeNull()
    expect(renewsAt({ usedAt: '2026-10-01T00:00:00Z', renewedAt: '2026-10-08T00:00:00Z' })).toBeNull()
    expect(renewsAt({ usedAt: '2026-10-01T00:00:00Z', renewedAt: null })).toBe('2026-10-08T00:00:00.000Z')
  })
  it('due only after the 7 days have passed', () => {
    const now = Date.parse('2026-11-23T00:00:00Z')
    expect(hasDueRenewal([{ usedAt: '2026-11-17T00:00:00Z', renewedAt: null }], now)).toBe(false)
    expect(hasDueRenewal([{ usedAt: '2026-11-16T00:00:00Z', renewedAt: null }], now)).toBe(true)
    expect(hasDueRenewal([{ usedAt: null, renewedAt: null }, { usedAt: '2026-01-01T00:00:00Z', renewedAt: '2026-01-08T00:00:00Z' }], now)).toBe(false)
  })
  it('the DB uses the same period', () => {
    expect(readFileSync('supabase/migrations/0063_invite_renewal_7d.sql', 'utf8')).toContain("used_at <= now() - interval '7 days'")
  })
})
