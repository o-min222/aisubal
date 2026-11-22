import { describe, expect, it } from 'vitest'
import { HANDLE_ERRORS, formatHandleDate, handleErrorCode, quotaFrom } from '@/lib/handle-policy'

const day = 86_400_000
const now = new Date('2026-11-22T12:00:00Z')
const ago = (d: number) => new Date(now.getTime() - d * day)

describe('handle policy rules (mirror of 0032)', () => {
  it('allows 2 changes per rolling 14 days', () => {
    expect(quotaFrom([], now)).toMatchObject({ remaining: 2, nextAt: null })
    expect(quotaFrom([ago(1)], now)).toMatchObject({ remaining: 1, nextAt: null })
    const q = quotaFrom([ago(3), ago(1)], now)
    expect(q.remaining).toBe(0)
    // the older of the two drops out at +14 days
    expect(q.nextAt).toBe(new Date(ago(3).getTime() + 14 * day).toISOString())
  })
  it('ignores changes older than the window', () => {
    expect(quotaFrom([ago(15), ago(20)], now).remaining).toBe(2)
    expect(quotaFrom([ago(15), ago(2)], now).remaining).toBe(1)
  })
  it('maps DB error codes, including the legacy profile_handle_taken', () => {
    expect(handleErrorCode('handle_change_cooldown')).toBe('handle_change_cooldown')
    expect(handleErrorCode('ERROR: handle_on_hold')).toBe('handle_on_hold')
    expect(handleErrorCode('profile_handle_taken')).toBe('handle_taken')
    expect(handleErrorCode('something else')).toBeNull()
    expect(HANDLE_ERRORS.handle_change_cooldown).toContain('{date}')
  })
  it('formats the next date in Korea time for both languages', () => {
    expect(formatHandleDate('2026-12-01T03:00:00Z', 'ko')).toMatch(/12월 1일/)
    expect(formatHandleDate('2026-12-01T03:00:00Z', 'en')).toMatch(/December 1/)
    expect(formatHandleDate(null, 'ko')).toBe('')
  })
})
