import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')

describe('A139b · article editor sticky bar', () => {
  const css = read('src/app/globals.css')
  const bar = css.slice(css.indexOf('.article-editor-bar {'), css.indexOf('.article-editor-bar .btn'))
  it('uses the app header surface and divider, fixed height, padded, clear of the header', () => {
    expect(bar).toContain('background: var(--n-fff)')
    expect(bar).toContain('border-bottom: 1px solid var(--n-e8e8e8)')
    expect(bar).toContain('height: 52px')
    expect(bar).toContain('padding: 0 14px')
    expect(bar).toContain('top: var(--top-bar-h, 61px)')
    expect(bar).toContain('html[data-topbar-hidden] .article-editor-bar')
  })
  it('status text has its own one-line slot', () => {
    expect(css).toMatch(/\.article-editor-status \{[^}]*white-space: nowrap/)
    const src = read('src/components/articles/article-editor.tsx')
    expect(src).toContain('article-editor-status')
    expect(src).toContain('저장됨 · 방금')
    expect(src).not.toContain('임시 저장됨')
  })
})
