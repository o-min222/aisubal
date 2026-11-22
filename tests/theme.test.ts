import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { isTheme, THEME_BOOT_SCRIPT, THEMES } from '@/lib/theme'

const css = readFileSync('src/app/globals.css', 'utf8')
const block = (sel: string) => {
  const i = css.indexOf(`\n${sel} {`, css.indexOf('/* ───── Color tokens'))
  return css.slice(i, css.indexOf('\n}', i))
}
const vars = (s: string) => new Set([...s.matchAll(/--([nc]-[0-9a-f]+):/g)].map((m) => m[1]))

describe('theme preference', () => {
  it('accepts only system | light | dark', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark'])
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('sepia')).toBe(false)
    expect(isTheme(undefined)).toBe(false)
  })
  it('boot script is self-contained and follows the OS for system', () => {
    expect(THEME_BOOT_SCRIPT).toContain('prefers-color-scheme: dark')
    expect(() => new Function(THEME_BOOT_SCRIPT)).not.toThrow()
  })
})

describe('color tokens', () => {
  const light = vars(block(':root'))
  const dark = vars(block('.dark'))
  it('every token has a dark value', () => {
    expect(light.size).toBeGreaterThan(50)
    expect([...light].filter((k) => !dark.has(k))).toEqual([])
  })
  it('every token used in CSS or TSX is defined', () => {
    const used = new Set([...css.matchAll(/var\(--([nc]-[0-9a-f]+)\)/g)].map((m) => m[1]))
    expect([...used].filter((k) => !light.has(k))).toEqual([])
  })
})
