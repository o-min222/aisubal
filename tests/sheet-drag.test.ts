import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { shouldCloseSheet, SHEET_CLOSE_DISTANCE, SHEET_CLOSE_VELOCITY } from '@/hooks/use-sheet-drag'

describe('A45 bottom sheet drag-to-close', () => {
  it('closes past the distance threshold (or 30% of a short sheet), else snaps back', () => {
    expect(shouldCloseSheet(SHEET_CLOSE_DISTANCE, 0, 800)).toBe(true)
    expect(shouldCloseSheet(SHEET_CLOSE_DISTANCE - 1, 0, 800)).toBe(false)
    expect(shouldCloseSheet(90, 0, 300)).toBe(true) // 30% of 300
    expect(shouldCloseSheet(40, 0.1, 800)).toBe(false)
  })
  it('a quick flick closes even when short; dragging up never closes', () => {
    expect(shouldCloseSheet(30, SHEET_CLOSE_VELOCITY, 800)).toBe(true)
    expect(shouldCloseSheet(8, 2, 800)).toBe(false) // a jitter, not a flick
    expect(shouldCloseSheet(-50, 3, 800)).toBe(false)
  })
  it('phone sheets have no visible X but keep a screen-reader close; desktop dialog unchanged', () => {
    const src = readFileSync('src/components/adaptive-sheet.tsx', 'utf8')
    expect(src).toContain('showCloseButton={false}')
    expect(src).toMatch(/<SheetClose className="sr-only">/)
    expect(src).toContain('data-sheet-grab')
    expect(src).toMatch(/<DialogContent className=/)
  })
})
