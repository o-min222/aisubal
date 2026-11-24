import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { enterSends } from '@/components/composer/composer-frame'

// A74 (Colin, t300u): Enter posts a comment, Shift+Enter is a new line, IME composition never posts.
const key = (o: Partial<Parameters<typeof enterSends>[0]> = {}) => ({ key: 'Enter', shiftKey: false, altKey: false, metaKey: false, ctrlKey: false, keyCode: 13, nativeEvent: { isComposing: false }, ...o })

describe('enterSends', () => {
  it('Enter sends on a keyboard device', () => expect(enterSends(key(), false)).toBe(true))
  it('Shift+Enter is a new line', () => expect(enterSends(key({ shiftKey: true }), false)).toBe(false))
  it('the Enter that commits a Korean syllable never sends', () => {
    expect(enterSends(key({ nativeEvent: { isComposing: true } }), false)).toBe(false)
    expect(enterSends(key({ keyCode: 229 }), false)).toBe(false) // Safari: compositionend first, then keyCode 229
  })
  it('touch screens keep Enter as a new line', () => expect(enterSends(key(), true)).toBe(false))
  it('other keys and modifiers do nothing', () => {
    expect(enterSends(key({ key: 'a' }), false)).toBe(false)
    expect(enterSends(key({ altKey: true }), false)).toBe(false)
  })
  it('every comment/reply composer opts in, top-level posts do not', () => {
    for (const f of ['src/components/feed/composer.tsx', 'src/components/anon/anon-composer.tsx']) {
      expect(readFileSync(join(__dirname, '..', f), 'utf8')).toContain('enterToSend={isReply}')
    }
  })
})
