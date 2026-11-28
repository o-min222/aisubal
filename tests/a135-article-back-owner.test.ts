import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { articleBackMode } from '@/lib/article-rules'

const read = (p: string) => readFileSync(p, 'utf8')
const O = 'https://aisubal.vercel.app'

describe('A135 · article reader back link', () => {
  it('goes history-back only for a same-origin referrer', () => {
    expect(articleBackMode(`${O}/articles`, O)).toBe('back')
    expect(articleBackMode(`${O}/feed`, O)).toBe('back')
    expect(articleBackMode(`${O}/articles/series/agent-notes`, O)).toBe('back')
    expect(articleBackMode('', O)).toBe('list')
    expect(articleBackMode(null, O)).toBe('list')
    expect(articleBackMode('https://news.ycombinator.com/item?id=1', O)).toBe('list')
    expect(articleBackMode('not a url', O)).toBe('list')
  })

  it('never goes back into the editor', () => {
    expect(articleBackMode(`${O}/articles/new`, O)).toBe('list')
    expect(articleBackMode(`${O}/articles/why-agents-fail/edit`, O)).toBe('list')
    expect(articleBackMode(`${O}/articles/why-agents-fail`, O)).toBe('back')
  })

  it('shows < 목록 instead of 아티클 and keeps a real /articles link', () => {
    const chrome = read('src/components/articles/article-reader-chrome.tsx')
    expect(chrome).toContain('ArticleBackLink')
    expect(chrome).not.toMatch(/<T>아티클<\/T>/)
    const back = read('src/components/articles/article-back-link.tsx')
    expect(back).toContain('href="/articles"')
    expect(back).toContain('router.back()')
    expect(back).toMatch(/<T>목록<\/T>/)
  })
})

describe('A135 · author menu', () => {
  it('moves 수정 out of the like/comment bar into a ⋯ menu with 수정/삭제 in the byline row', () => {
    const actions = read('src/components/articles/article-actions.tsx')
    expect(actions).not.toContain('articleEditHref')
    expect(actions).not.toContain('Pencil')
    const menu = read('src/components/articles/article-owner-menu.tsx')
    expect(menu).toContain('articleEditHref')
    expect(menu).toMatch(/method: 'DELETE'/)
    const page = read('src/app/articles/[slug]/page.tsx')
    expect(page.indexOf('ArticleOwnerMenu articleId')).toBeGreaterThan(page.indexOf('article-read-byline'))
    expect(page.indexOf('ArticleOwnerMenu articleId')).toBeLessThan(page.indexOf('article-read-cover'))
  })
})
