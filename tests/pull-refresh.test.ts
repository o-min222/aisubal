import { describe, expect, it } from 'vitest'
import { PULL_THRESHOLD, pullProgress } from '@/lib/pull-refresh'

describe('pullProgress', () => {
  it('is 0 at rest and clamps at 1 past the threshold', () => {
    expect(pullProgress(0)).toBe(0)
    expect(pullProgress(-20)).toBe(0)
    expect(pullProgress(PULL_THRESHOLD * 3)).toBe(1)
  })
  it('is below 1 before the threshold, so a short pull never refreshes', () => {
    expect(pullProgress(PULL_THRESHOLD / 2)).toBeLessThan(1)
  })
})
