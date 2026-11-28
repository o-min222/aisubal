import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  articleCardFocus,
  articleShareFocus,
  articleFocusCss,
  clampArticleFocus,
  parseArticleImageFocus,
  DEFAULT_ARTICLE_FOCUS,
} from '@/lib/article-rules'
import { handleDataTool, dataErrorMessage } from '@/lib/mcp-data'
import { TOOL_SPECS } from '@/lib/mcp/tools'
import { skillMarkdown } from '@/lib/skill-md'
import { MCP_CONFIG_VERSION } from '@/lib/mcp/config-version'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const UUID = '11111111-2222-4333-8444-555555555555'

describe('A138 · focus helpers', () => {
  it('clamps x/y to 0-100 and parses crop|contain', () => {
    expect(clampArticleFocus(-4)).toBe(0)
    expect(clampArticleFocus(140)).toBe(100)
    expect(clampArticleFocus('33.333')).toBe(33.33)
    expect(clampArticleFocus('nope')).toBe(50)
    expect(parseArticleImageFocus(null)).toBeNull()
    expect(parseArticleImageFocus({ fit: 'contain' })).toEqual({ x: 50, y: 50, fit: 'contain' })
    expect(parseArticleImageFocus({ x: 20, y: 80, fit: 'stretch', extra: 1 })).toEqual({ x: 20, y: 80, fit: 'crop' })
  })

  it('cards use thumbnail focus when a thumbnail is set, else cover; share is the opposite', () => {
    const coverF = { x: 10, y: 20, fit: 'contain' as const }
    const thumbF = { x: 90, y: 80, fit: 'crop' as const }
    const both = { coverPath: 'c', thumbnailPath: 't', coverFocus: coverF, thumbnailFocus: thumbF }
    expect(articleCardFocus(both)).toEqual(thumbF)
    expect(articleShareFocus(both)).toEqual(coverF)
    expect(articleCardFocus({ coverPath: 'c', coverFocus: coverF })).toEqual(coverF)
    expect(articleShareFocus({ thumbnailPath: 't', thumbnailFocus: thumbF })).toEqual(thumbF)
    expect(articleCardFocus({})).toEqual(DEFAULT_ARTICLE_FOCUS)
    expect(articleFocusCss({ x: 12, y: 88, fit: 'contain' })).toEqual({ objectPosition: '12% 88%', objectFit: 'contain' })
  })
})

describe('A138 · MCP: focal point on article_create / article_edit', () => {
  type Call = { fn: string; args: Record<string, unknown> }
  const run = async (name: string, args: Record<string, unknown>) => {
    const calls: Call[] = []
    const out = await handleDataTool(name, args, 'tok', async (fn, a) => {
      calls.push({ fn, args: a })
      return { data: { id: UUID, slug: 's', status: 'draft' }, error: null }
    }, 'https://example.test')
    return { out, calls }
  }

  it('create passes x/y/fit as p_cover_focus / p_thumbnail_focus', async () => {
    const { calls } = await run('article_create', {
      title: 'T',
      body: 'B',
      cover: { imageId: UUID, x: 20, y: 80, fit: 'contain' },
    })
    expect(calls[0]!.fn).toBe('mcp_article_create')
    expect(calls[0]!.args.p_cover_id).toBe(UUID)
    expect(calls[0]!.args.p_cover_focus).toEqual({ x: 20, y: 80, fit: 'contain' })
    expect(calls[0]!.args.p_thumbnail_focus).toBeNull()
  })

  it('edit can be focus-only, and a nested focus object wins', async () => {
    const { calls } = await run('article_edit', { id: UUID, cover: { focus: { x: 5, y: 95, fit: 'crop' }, x: 1, y: 1 } })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.args).toMatchObject({
      p_cover_id: null,
      p_cover_clear: false,
      p_cover_focus: { x: 5, y: 95, fit: 'crop' },
      p_cover_focus_set: true,
      p_thumbnail_focus_set: false,
    })
  })

  it('a new image without focus leaves focus_set false so the DB resets it', async () => {
    const { calls } = await run('article_edit', { id: UUID, cover: { imageId: UUID } })
    expect(calls[0]!.args).toMatchObject({ p_cover_id: UUID, p_cover_focus_set: false, p_cover_focus: null })
  })

  it('create cannot be focus-only; empty edit cover is still rejected', async () => {
    expect((await run('article_create', { title: 'T', body: 'B', cover: { x: 20, y: 20 } })).out.error).toBeTruthy()
    expect((await run('article_edit', { id: UUID, cover: {} })).out.error).toBeTruthy()
  })

  it('registry, error text, guides and MCP_CONFIG_VERSION', () => {
    expect(MCP_CONFIG_VERSION).toBe('2026-11-28.2')
    for (const n of ['article_create', 'article_edit']) {
      const shape = (TOOL_SPECS.find((x) => x.name === n)!.input as { shape: Record<string, unknown> }).shape
      const cover = shape.cover as { unwrap?: () => { shape: Record<string, unknown> }; shape?: Record<string, unknown> }
      const inner = (cover.unwrap ? cover.unwrap().shape : cover.shape) as Record<string, unknown>
      expect(Object.keys(inner)).toEqual(expect.arrayContaining(['x', 'y', 'fit', 'focus', 'imageId']))
    }
    expect(dataErrorMessage('bad_focus')).toMatch(/0-100/)
    const guide = skillMarkdown('https://x.test')
    expect(guide).toMatch(/focal point|x` and `y/)
    expect(read('docs/mcp.md')).toMatch(/fit \(crop\|contain\)/)
    expect(read('src/lib/mcp/server.ts')).toContain('x, y, fit')
  })
})

describe('A138 · migration 0155', () => {
  const sql = read('supabase/migrations/0155_article_image_focus.sql')
  it('adds focus columns, checks, revoked grants, and recreates upsert / MCP with defaults', () => {
    expect(sql).toContain('article__focus_ok')
    expect(sql).toContain('add column if not exists cover_focus jsonb')
    expect(sql).toContain('add column if not exists thumbnail_focus jsonb')
    expect(sql).toContain('articles_cover_focus_chk')
    expect(sql).toContain('revoke insert (cover_focus, thumbnail_focus) on public.articles from public, anon, authenticated')
    expect(sql).toContain("'coverFocus', a.cover_focus, 'thumbnailFocus', a.thumbnail_focus")
    expect(sql).toContain('p_cover_focus jsonb default null, p_thumbnail_focus jsonb default null')
    expect(sql).toContain('p_cover_focus_set boolean default false')
    expect(sql).toContain("raise exception 'bad_focus'")
    expect(sql).toContain("article__cfg_on('article_share_preview')")
    expect(sql).toContain("peek__has_pii")
    expect(sql).not.toContain('mcp_config_version()')
    expect(sql).toMatch(/grant execute on function\s+public\.mcp_article_create\([^)]*jsonb, jsonb\)/)
    expect(sql).toMatch(/revoke all on function public\.article__focus_ok\(jsonb\) from public, anon, authenticated/)
  })
})
