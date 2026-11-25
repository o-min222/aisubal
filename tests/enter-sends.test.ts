import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COMPOSER_ENTER_KEY_HINT, composerKeySubmits, isImeComposing } from '@/lib/composer-keys'

// A102: Enter is a newline everywhere; Cmd/Ctrl+Enter submits on a keyboard; touch is button-only; IME never submits.
const key = (o: Partial<Parameters<typeof composerKeySubmits>[0]> = {}) => ({
  key: 'Enter',
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ctrlKey: false,
  keyCode: 13,
  nativeEvent: { isComposing: false },
  ...o,
})

describe('composerKeySubmits', () => {
  it('plain Enter is a newline on a keyboard and on touch', () => {
    expect(composerKeySubmits(key(), false)).toBe(false)
    expect(composerKeySubmits(key(), true)).toBe(false)
  })
  it('Cmd/Ctrl+Enter submits on a keyboard, never on touch', () => {
    expect(composerKeySubmits(key({ metaKey: true }), false)).toBe(true)
    expect(composerKeySubmits(key({ ctrlKey: true }), false)).toBe(true)
    expect(composerKeySubmits(key({ metaKey: true }), true)).toBe(false)
    expect(composerKeySubmits(key({ ctrlKey: true }), true)).toBe(false)
  })
  it('Shift+Enter and Alt+Enter stay a newline', () => {
    expect(composerKeySubmits(key({ shiftKey: true, metaKey: true }), false)).toBe(false)
    expect(composerKeySubmits(key({ altKey: true, ctrlKey: true }), false)).toBe(false)
    expect(composerKeySubmits(key({ shiftKey: true }), false)).toBe(false)
  })
  it('the Enter that commits a Korean syllable never submits', () => {
    expect(composerKeySubmits(key({ metaKey: true, nativeEvent: { isComposing: true } }), false)).toBe(false)
    expect(composerKeySubmits(key({ ctrlKey: true, isComposing: true }), false)).toBe(false)
    expect(composerKeySubmits(key({ metaKey: true, keyCode: 229 }), false)).toBe(false) // Safari: compositionend first, then keyCode 229
    expect(isImeComposing(key({ keyCode: 229 }))).toBe(true)
  })
  it('a held key or a non-Enter key does not submit', () => {
    expect(composerKeySubmits(key({ metaKey: true, repeat: true }), false)).toBe(false)
    expect(composerKeySubmits(key({ key: 'a', metaKey: true }), false)).toBe(false)
  })
  it('every post and comment composer uses the shared helper, and none submit on plain Enter', () => {
    const files = [
      'src/lib/composer-keys.ts',
      'src/components/composer/composer-frame.tsx',
      'src/components/feed/quick-composer.tsx',
      'src/components/feed/composer.tsx',
      'src/components/anon/anon-composer.tsx',
    ]
    for (const f of files) {
      const src = readFileSync(join(__dirname, '..', f), 'utf8')
      expect(src, f).not.toMatch(/enterToSend|enterSends|quickShouldSubmit/)
    }
    const frame = readFileSync(join(__dirname, '..', 'src/components/composer/composer-frame.tsx'), 'utf8')
    const quick = readFileSync(join(__dirname, '..', 'src/components/feed/quick-composer.tsx'), 'utf8')
    expect(frame).toContain('composerKeySubmits')
    expect(frame).toContain('COMPOSER_ENTER_KEY_HINT')
    expect(quick).toContain('composerKeySubmits')
    expect(quick).toContain('COMPOSER_ENTER_KEY_HINT')
    expect(quick).toMatch(/<textarea/)
    expect(COMPOSER_ENTER_KEY_HINT).toBe('enter')
  })
})
