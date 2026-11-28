import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import {
  articleCardImagePath,
  articleShareImagePath,
  articleShareImagePaths,
  firstInlineImagePath,
  ARTICLE_LIBRARY_CAP,
} from '@/lib/article-rules'
import { processArticleImage, sniffArticleImage } from '@/lib/article-image-process'
import { handleDataTool, dataErrorMessage } from '@/lib/mcp-data'
import { TOOL_SPECS } from '@/lib/mcp/tools'
import { skillMarkdown } from '@/lib/skill-md'

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8')
const UUID = '11111111-2222-4333-8444-555555555555'
const UUID2 = '99999999-2222-4333-8444-555555555555'

describe('A136 · card and share image order', () => {
  const all = { coverPath: 'a/cover.jpg', thumbnailPath: 'a/thumb.jpg', firstImagePath: 'a/first.jpg' }
  it('cards: thumbnail, cover, first body image, then the letter', () => {
    expect(articleCardImagePath(all)).toBe('a/thumb.jpg')
    expect(articleCardImagePath({ ...all, thumbnailPath: null })).toBe('a/cover.jpg')
    expect(articleCardImagePath({ firstImagePath: 'a/first.jpg' })).toBe('a/first.jpg')
    expect(articleCardImagePath({})).toBeNull()
  })
  it('share card: cover, thumbnail, first body image, then the default card', () => {
    expect(articleShareImagePath(all)).toBe('a/cover.jpg')
    expect(articleShareImagePath({ ...all, coverPath: null })).toBe('a/thumb.jpg')
    expect(articleShareImagePath({ firstImagePath: 'a/first.jpg' })).toBe('a/first.jpg')
    expect(articleShareImagePath({})).toBeNull()
    expect(articleShareImagePaths(all)).toEqual(['a/cover.jpg', 'a/thumb.jpg', 'a/first.jpg'])
    expect(articleShareImagePaths({ coverPath: 'x', thumbnailPath: 'x' })).toEqual(['x'])
  })
  it('finds the first inline image, including the url-encoded path the editor writes', () => {
    expect(firstInlineImagePath('hi\n\n![a](/api/article-image?p=u1%2Fabc.png)\n![b](/api/article-image?p=u1%2Fdef.png)')).toBe('u1/abc.png')
    expect(firstInlineImagePath('no images here')).toBeNull()
    expect(firstInlineImagePath('![x](https://example.com/a.png)')).toBeNull()
  })
})

describe('A136 · agent image processing (same limits as /api/article-image)', () => {
  const png = (w: number, h: number, alpha: boolean) =>
    sharp({ create: { width: w, height: h, channels: alpha ? 4 : 3, background: alpha ? { r: 255, g: 0, b: 0, alpha: 0.5 } : { r: 10, g: 120, b: 200 } } }).png().toBuffer()

  it('sniffs the type from magic bytes, not from a header', () => {
    expect(sniffArticleImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull()
    expect(sniffArticleImage(Buffer.from('GIF89a......'))).toBe('image/gif')
  })
  it('re-encodes a big opaque PNG as a smaller JPEG within 2000 px', async () => {
    const r = await processArticleImage(await png(3000, 1500, false))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.mime).toBe('image/jpeg')
      expect(Math.max(r.width, r.height)).toBe(2000)
      expect(r.bytes.length).toBeLessThanOrEqual(1_500_000)
    }
  })
  it('keeps transparency as PNG and drops metadata', async () => {
    const withExif = await sharp(await png(200, 100, true)).withMetadata({ exif: { IFD0: { Copyright: 'secret' } } }).png().toBuffer()
    const r = await processArticleImage(withExif)
    expect(r.ok && r.mime).toBe('image/png')
    if (r.ok) expect((await sharp(r.bytes).metadata()).exif).toBeUndefined()
  })
  it('refuses text, SVG, oversize and corrupt input', async () => {
    expect(await processArticleImage(Buffer.from('<svg></svg>'))).toEqual({ ok: false, error: 'not_image' })
    expect(await processArticleImage(Buffer.alloc(4 * 1024 * 1024 + 1))).toEqual({ ok: false, error: 'too_large' })
    expect(await processArticleImage(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]))).toEqual({ ok: false, error: 'decode_failed' })
  })
})

describe('A136 · MCP: cover / thumbnail on article_create and article_edit, and the library tools', () => {
  type Call = { fn: string; args: Record<string, unknown> }
  const run = async (name: string, args: Record<string, unknown>, reply: (c: Call) => unknown = () => ({ id: UUID, slug: 's', status: 'draft' })) => {
    const calls: Call[] = []
    const out = await handleDataTool(name, args, 'tok', async (fn, a) => {
      calls.push({ fn, args: a })
      return { data: reply({ fn, args: a }), error: null }
    }, 'https://example.test')
    return { out, calls }
  }
  const b64 = async () => (await sharp({ create: { width: 64, height: 64, channels: 3, background: '#336699' } }).jpeg().toBuffer()).toString('base64')

  it('article_create passes a library image as p_cover_id / p_thumbnail_id', async () => {
    const { calls } = await run('article_create', { title: 'T', body: 'B', cover: { imageId: UUID }, thumbnail: { imageId: UUID2 } })
    const c = calls.find((x) => x.fn === 'mcp_article_create')!
    expect(c.args.p_cover_id).toBe(UUID)
    expect(c.args.p_thumbnail_id).toBe(UUID2)
  })
  it('a base64 upload goes through mcp_article_image_put into the owner library, then attaches', async () => {
    const { calls } = await run('article_create', { title: 'T', body: 'B', cover: { imageBase64: `data:image/jpeg;base64,${await b64()}` } }, ({ fn }) =>
      fn === 'mcp_article_image_put' ? { id: UUID, path: 'auth/x.jpg', kind: 'cover' } : { id: 'a1', slug: 's', status: 'draft' })
    expect(calls.map((c) => c.fn)).toEqual(['mcp_article_image_put', 'mcp_article_create'])
    expect(calls[0]!.args.p_mime).toBe('image/jpeg')
    expect(calls[0]!.args.p_kind).toBe('cover')
    expect(calls[1]!.args.p_cover_id).toBe(UUID)
  })
  it('article_edit: omitted = unchanged, remove clears, and a clear is not an upload', async () => {
    const same = (await run('article_edit', { id: UUID, title: 'T2' })).calls[0]!.args
    expect(same).toMatchObject({ p_cover_id: null, p_cover_clear: false, p_thumbnail_id: null, p_thumbnail_clear: false })
    const clear = (await run('article_edit', { id: UUID, cover: { remove: true }, thumbnail: { remove: true } })).calls[0]!.args
    expect(clear).toMatchObject({ p_cover_clear: true, p_thumbnail_clear: true, p_cover_id: null })
  })
  it('rejects ambiguous slots, remove on create, and bad ids before touching the database', async () => {
    for (const [name, args] of [
      ['article_create', { title: 'T', body: 'B', cover: { imageId: UUID, url: 'https://x.test/a.png' } }],
      ['article_create', { title: 'T', body: 'B', cover: { remove: true } }],
      ['article_create', { title: 'T', body: 'B', thumbnail: { imageId: 'nope' } }],
      ['article_edit', { id: UUID, cover: {} }],
    ] as const) {
      const { out, calls } = await run(name, { ...args })
      expect(out.error).toBeTruthy()
      expect(calls).toHaveLength(0)
    }
  })
  it('refuses http (non-https) image URLs and non-image bytes', async () => {
    expect((await run('article_image_upload', { url: 'http://example.com/a.png' })).out.error).toBeTruthy()
    expect((await run('article_image_upload', { imageBase64: Buffer.from('hello world, not an image').toString('base64') })).out.error).toMatch(/JPEG, PNG, WebP or GIF/)
    expect((await run('article_image_upload', {})).out.error).toMatch(/exactly one/)
  })
  it('article_image_list returns absolute urls and markdown for the owner library', async () => {
    const { out } = await run('article_image_list', { limit: 5 }, () => ({ images: [{ id: UUID, path: 'auth/x.jpg', name: 'Hero', kind: 'cover', usedBy: 2, byAgent: true }], total: 1, cap: ARTICLE_LIBRARY_CAP }))
    const img = (out.images as Array<Record<string, unknown>>)[0]!
    expect(img.url).toBe('https://example.test/api/article-image?p=auth%2Fx.jpg')
    expect(img.markdown).toBe('![Hero](/api/article-image?p=auth%2Fx.jpg)')
  })
  it('article_image_remove passes the id to the agent-scoped RPC', async () => {
    const { calls } = await run('article_image_remove', { id: UUID }, () => ({ ok: true }))
    expect(calls[0]).toMatchObject({ fn: 'mcp_article_image_remove', args: { p_id: UUID } })
  })
  it('registry: three new tools under article:write, cover/thumbnail on create + edit, error texts, guide', () => {
    for (const n of ['article_image_upload', 'article_image_list', 'article_image_remove']) {
      const t = TOOL_SPECS.find((x) => x.name === n)!
      expect(t.scopes).toEqual(['article:write'])
      expect(t.domain).toBe('article')
    }
    for (const n of ['article_create', 'article_edit']) {
      const shape = Object.keys(TOOL_SPECS.find((x) => x.name === n)!.input.shape)
      expect(shape).toEqual(expect.arrayContaining(['cover', 'thumbnail']))
    }
    expect(dataErrorMessage('library_full')).toMatch(/library is full/)
    expect(dataErrorMessage('bad_cover')).toMatch(/cover\.imageId/)
    expect(dataErrorMessage('image_rate_limited')).toMatch(/30/)
    const guide = skillMarkdown('https://x.test')
    for (const w of ['article_image_list', 'article_image_upload', 'article_image_remove', 'thumbnail']) expect(guide).toContain(w)
    expect(read('docs/mcp.md')).toContain('article_image_upload')
  })
})

describe('A136 · migration 0153 locks the new tables down', () => {
  const sql = read('supabase/migrations/0153_article_thumbnail_library.sql')
  it('library rows are owner-only, blobs have no direct grants, helpers are not callable by clients', () => {
    expect(sql).toContain('alter table public.article_images enable row level security')
    expect(sql).toContain('using (member_id = (select public.current_member_id()))')
    expect(sql).toContain('alter table public.article_image_blobs enable row level security')
    expect(sql).not.toMatch(/grant (select|insert|update|delete|all)[^;]*on (table )?public\.article_image_blobs/i)
    expect(sql).not.toMatch(/grant [^;]*on (table )?public\.article_images[^;]* to anon/i)
    expect(sql).toContain('revoke all on function public.article__library_remove')
  })
  it('thumbnail_path is validated like cover_path, and removing an image never breaks articles that use it', () => {
    expect(sql).toContain('thumbnail_path')
    expect(sql).toContain("'bad_thumbnail'")
    expect(sql).toContain('article__image_uses')
    expect(sql).toContain('%2F')
  })
})
