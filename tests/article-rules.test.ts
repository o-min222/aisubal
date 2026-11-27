import { describe, expect, it } from 'vitest'
import {
  ARTICLE_RESERVED_SLUGS,
  ARTICLE_TEASER_MAX,
  articleHref,
  articleEditHref,
  articleOgTeaser,
  articlePlainText,
  articleReadingSec,
  articleSlugBase,
  articleTeaserBody,
  canPublishArticle,
  formatReadingTime,
  isPublicArticlePath,
  isReservedArticleSlug,
  sanitizeArticleShareLine,
  articleDocumentTitle,
} from '@/lib/article-rules'

describe('isPublicArticlePath', () => {
  it('allows a reading slug and rejects reserved or nested paths', () => {
    expect(isPublicArticlePath('/articles/why-agents-fail')).toBe(true)
    expect(isPublicArticlePath('/articles/why-agents-fail?x=1#c')).toBe(true)
    expect(isPublicArticlePath('/articles/new')).toBe(false)
    expect(isPublicArticlePath('/articles/mine')).toBe(false)
    expect(isPublicArticlePath('/articles/series')).toBe(false)
    expect(isPublicArticlePath('/articles/series/weekly-notes')).toBe(false)
    expect(isPublicArticlePath('/articles/abc/edit')).toBe(false)
    expect(isPublicArticlePath('/articles')).toBe(false)
    expect(isPublicArticlePath('/posts/why-agents-fail')).toBe(false)
  })
})

describe('slug and hrefs', () => {
  it('builds a latin slug and leaves Korean-only titles empty', () => {
    expect(articleSlugBase('Why Agents Fail')).toBe('why-agents-fail')
    expect(articleSlugBase('  Hello, World!!  ')).toBe('hello-world')
    expect(articleSlugBase('에이전트가 실패하는 이유')).toBe('')
    expect(isReservedArticleSlug('new')).toBe(true)
    expect(isReservedArticleSlug('why-agents-fail')).toBe(false)
    expect(articleHref('why-agents-fail')).toBe('/articles/why-agents-fail')
    expect(articleEditHref('why-agents-fail')).toBe('/articles/why-agents-fail/edit')
    expect(ARTICLE_RESERVED_SLUGS).toContain('series')
  })
})

describe('plain text, reading time, teaser', () => {
  it('strips markdown and counts ~500 characters per minute', () => {
    expect(articlePlainText('# 제목\n\n안녕 **세상** [링크](https://x.test)')).toBe('제목\n\n안녕 세상 링크')
    expect(articleReadingSec('')).toBe(0)
    expect(articleReadingSec('가'.repeat(10))).toBe(60)
    expect(articleReadingSec('가'.repeat(500))).toBe(60)
    expect(articleReadingSec('가'.repeat(501))).toBe(120)
    expect(formatReadingTime(60, (s, v) => s.replace('{n}', String(v?.n)))).toBe('약 1분')
    expect(formatReadingTime(180, (s, v) => s.replace('{n}', String(v?.n)))).toBe('약 3분')
  })

  it('cuts the reading teaser at a paragraph and never returns the rest', () => {
    const first = '여는 문단입니다. 여기까지는 누구나 읽어요.\n\n'
    const rest = '비밀 본문입니다. 이 문장은 비회원에게 가면 안 됩니다.'
    const body = first + '가'.repeat(ARTICLE_TEASER_MAX) + '\n\n' + rest
    const teaser = articleTeaserBody(body)
    expect(teaser.length).toBeLessThanOrEqual(ARTICLE_TEASER_MAX)
    expect(teaser).toContain('여는 문단입니다')
    expect(teaser).not.toContain('비밀 본문입니다')
    expect(articleTeaserBody('짧아요')).toBe('짧아요')
  })

  it('builds a short OG teaser and strips links and mentions', () => {
    expect(articleOgTeaser({ body: '한 줄짜리 여는 문장입니다. 더 긴 이야기는 본문에서.' })?.startsWith('한 줄짜리')).toBe(true)
    expect(articleOgTeaser({ body: '짧' })).toBeNull()
    expect(sanitizeArticleShareLine('안녕 @dev 그리고 https://secret.test 끝')).toBe('안녕 그리고 끝')
  })
})

describe('canPublishArticle', () => {
  it('uses article_can_publish when present, otherwise admin or writer', () => {
    expect(canPublishArticle({ is_admin: true })).toBe(true)
    expect(canPublishArticle({ article_writer: true })).toBe(true)
    expect(canPublishArticle({ is_admin: false, article_writer: false })).toBe(false)
    expect(canPublishArticle({ is_admin: true, article_can_publish: false })).toBe(false)
    expect(canPublishArticle({ article_can_publish: true, article_writer: false })).toBe(true)
    expect(canPublishArticle(null)).toBe(false)
  })
})

describe('articleDocumentTitle', () => {
  it('sets an absolute tab title so the root layout template cannot replace it', () => {
    expect(articleDocumentTitle('짧은 글의 앞부분만 공개됩니다')).toEqual({
      absolute: '짧은 글의 앞부분만 공개됩니다 · AI쓰발',
    })
    expect(articleDocumentTitle('  ')).toEqual({ absolute: '아티클 · AI쓰발' })
    expect(articleDocumentTitle(null)).toEqual({ absolute: '아티클 · AI쓰발' })
  })
})

describe('edit route', () => {
  it('lives at [slug]/edit and redirects a leftover id URL to the slug', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    const src = readFileSync('src/app/(app)/articles/[slug]/edit/page.tsx', 'utf8')
    expect(src).toMatch(/getArticle\(slug\)/)
    expect(src).toMatch(/getArticleById\(slug\)/)
    expect(src).toMatch(/redirect\(articleEditHref\(article\.slug\)\)/)
  })
})
