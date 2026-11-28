import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { autosizeTextarea } from '@/lib/autosize-textarea'

const css = readFileSync(join(__dirname, '..', 'src/app/globals.css'), 'utf8')

function fakeTextarea(contentH: number) {
  const el = { scrollHeight: contentH, style: {} as Record<string, string> }
  return el as unknown as HTMLTextAreaElement & { style: Record<string, string> }
}

describe('A139 · auto-growing textareas never show a stray scrollbar', () => {
  it('rounds up and hides overflow while under the cap', () => {
    const el = fakeTextarea(34)
    autosizeTextarea(el, 160)
    expect(el.style.height).toBe('35px')
    expect(el.style.overflowY).toBe('hidden')
  })
  it('caps the height and only then allows scrolling', () => {
    const el = fakeTextarea(400)
    autosizeTextarea(el, 160)
    expect(el.style.height).toBe('160px')
    expect(el.style.overflowY).toBe('auto')
  })
  it('the quick composer and shared composer inputs hide the scrollbar chrome', () => {
    for (const sel of ['.qc-input', '.composer-input']) {
      const block = css.slice(css.indexOf(`${sel} {`), css.indexOf('}', css.indexOf(`${sel} {`)))
      expect(block).toContain('scrollbar-width: none')
      expect(block).toContain('overflow-y: hidden')
      expect(css).toContain(`${sel}::-webkit-scrollbar { display: none; }`)
    }
  })
})
