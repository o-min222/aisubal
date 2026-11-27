import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { isPublicArticlePath, articleTeaserBody, canPublishArticle } from '@/lib/article-rules'
import { sharePreviewKind } from '@/lib/share-teaser'
import { SIDE_NAV } from '@/components/shell/nav-items'
import { DASHBOARD_TABS, parseDashboardTab } from '@/lib/dashboard-tabs'
import { SEARCH_TABS, parseSearchTab } from '@/lib/search-rules'
import { ARCHIVE_KINDS, isArchiveKind } from '@/lib/archive-rules'
import { DEFAULT_PREFS, NOTIFY_CATEGORIES, notificationSentence } from '@/lib/notifications'
import { getArticle } from '@/lib/data/articles'

beforeAll(() => {
  process.env.DEV_BYPASS_AUTH = 'true'
})

describe('A108 wiring', () => {
  it('keeps /articles/{slug} public and reserves editor routes', () => {
    expect(isPublicArticlePath('/articles/why-agents-fail')).toBe(true)
    expect(isPublicArticlePath('/articles/new')).toBe(false)
    expect(sharePreviewKind('/articles/why-agents-fail')).toBe('article')
    expect(sharePreviewKind('/articles/new')).toBeNull()
    expect(sharePreviewKind('/articles/series/agent-notes')).toBeNull()
  })

  it('adds 아티클 to nav, dashboard, search, archive and notification prefs', () => {
    expect(SIDE_NAV.some((i) => i.href === '/articles')).toBe(true)
    expect(SIDE_NAV.filter((i) => !i.soon).length).toBeGreaterThanOrEqual(6)
    expect(DASHBOARD_TABS.some((t) => t.id === 'articles')).toBe(true)
    expect(parseDashboardTab('articles')).toBe('articles')
    expect(SEARCH_TABS.some((t) => t.id === 'articles')).toBe(true)
    expect(parseSearchTab('articles')).toBe('articles')
    expect(isArchiveKind('article')).toBe(true)
    expect(ARCHIVE_KINDS).toContain('article')
    expect(DEFAULT_PREFS.articles).toBe(true)
    expect(NOTIFY_CATEGORIES.some((c) => c.id === 'articles')).toBe(true)
  })

  it('treats admins as publishers and respects article_can_publish', () => {
    expect(canPublishArticle({ is_admin: true })).toBe(true)
    expect(canPublishArticle({ article_writer: false, article_can_publish: false, is_admin: true })).toBe(false)
  })
})

describe('signed-out teaser', () => {
  it('never includes the rest of the mock body', async () => {
    const teaser = await getArticle('why-agents-fail', { teaser: true })
    expect(teaser).toBeTruthy()
    expect(teaser!.truncated).toBe(true)
    expect(teaser!.body).toBeTruthy()
    expect(teaser!.body).not.toContain('비밀 본문입니다')
    expect(articleTeaserBody(teaser!.body ?? '')).toBe(teaser!.body)
    const full = await getArticle('why-agents-fail')
    expect(full?.body).toContain('비밀 본문입니다')
    expect(full?.truncated).toBe(false)
  })

  it('builds a notification sentence for a new article', () => {
    const s = notificationSentence({
      id: 'n',
      kind: 'article_published',
      category: 'articles',
      link: '/articles/why-agents-fail',
      excerpt: '에이전트가 실패하는 이유',
      targetKind: 'article',
      count: 1,
      createdAt: new Date().toISOString(),
      unread: true,
      actor: { kind: 'member', id: 'm', name: '프롬프트수집가', avatarUrl: null },
    })
    expect(s.s).toContain('새 아티클')
    expect(s.name).toBe('프롬프트수집가')
  })
})

describe('A108 header and title layout', () => {
  it('puts browse and mine actions on a nowrap row that stacks under the title on small screens', () => {
    const browse = readFileSync('src/app/(app)/articles/page.tsx', 'utf8')
    const mine = readFileSync('src/app/(app)/articles/mine/page.tsx', 'utf8')
    const css = readFileSync('src/app/globals.css', 'utf8')
    expect(browse).toContain('article-page-head')
    expect(browse).toContain('article-page-actions')
    expect(mine).toContain('article-page-head')
    expect(mine).toContain('article-page-actions')
    expect(css).toMatch(/\.article-page-actions \.btn \{[^}]*white-space: nowrap/)
    expect(css).toMatch(/\.article-page-head \{[^}]*flex-direction: column/)
    expect(css).toMatch(/@media \(min-width: 640px\)[\s\S]*\.article-page-head \{[^}]*flex-direction: row/)
  })

  it('sets the reader document title absolutely so the tab shows the article title', () => {
    const page = readFileSync('src/app/articles/[slug]/page.tsx', 'utf8')
    expect(page).toContain('articleDocumentTitle')
    expect(page).not.toMatch(/title: `\$\{title\} · AI쓰발`/)
  })
})
