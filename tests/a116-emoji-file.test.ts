import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A116 · custom emoji file picker', () => {
  it('hides the native file input and shows a clear choose/preview/remove UI', () => {
    const r = read('src/components/timeline/reactions.tsx')
    expect(r).toContain("className=\"sr-only\"")
    expect(r).toContain("tx('이미지 선택')")
    expect(r).toContain("tx('다시 선택')")
    expect(r).toContain("tx('빼기')")
    expect(r).toContain('rx-file-preview')
    expect(r).toContain('prepareUploadImage')
    expect(r).toContain('CUSTOM_EMOJI_MAX_BYTES')
    expect(r).not.toContain('className="rx-file"')
    const en = read('src/i18n/dict/en.ts')
    expect(en).toContain('"이미지 선택": "Choose image"')
    expect(en).toContain('"다시 선택": "Choose again"')
  })
})
