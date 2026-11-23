import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cleanStackItems } from '@/lib/profile-stack'

// A41: profile stack chips are add/delete only — no per-chip visibility.
describe('profile stack chips', () => {
  it('drops any per-chip visibility on save', () => {
    expect(cleanStackItems([{ label: 'ChatGPT', visibility: 'private' }, { label: 'Claude', visibility: 'friends' }]).map((i) => i.visibility)).toEqual([null, null])
  })
  it('chips open no menu; the editor shows an inline delete instead', () => {
    const src = readFileSync('src/components/profile/profile-card-editor.tsx', 'utf8')
    expect(src).toContain('className="pe-chip-x"')
    expect(src).not.toContain("tx('{label} 설정'")
  })
})
