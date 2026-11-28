import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { embedOf, socialKind, vimeoId, EXPANDED_LINKS } from '@/lib/link-embed'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'

// A58: one expanded link per post; videos are click-to-load (no third-party request before the tap).
describe('A58 inline link previews', () => {
  it('YouTube / Shorts / youtu.be → nocookie player without autoplay; Vimeo → dnt player', () => {
    const w = embedOf('https://www.youtube.com/watch?v=zjkBMFhNj_g')
    expect(w).toMatchObject({ kind: 'youtube', id: 'zjkBMFhNj_g', vertical: false })
    expect(w!.src).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/zjkBMFhNj_g\?/)
    expect(w!.src).not.toMatch(/autoplay/)
    expect(embedOf('https://youtube.com/shorts/abcDEF12345')).toMatchObject({ vertical: true })
    expect(embedOf('https://youtu.be/zjkBMFhNj_g')?.id).toBe('zjkBMFhNj_g')
    expect(vimeoId('https://vimeo.com/76979871')).toBe('76979871')
    expect(embedOf('https://vimeo.com/76979871')?.src).toBe('https://player.vimeo.com/video/76979871?dnt=1')
    expect(embedOf('https://example.com/watch?v=x')).toBeNull()
    expect(embedOf('javascript:alert(1)')).toBeNull()
  })

  it('oEmbed hosts and the one-link rule', () => {
    expect(socialKind('https://www.tiktok.com/@a/video/1')).toBe('tiktok')
    expect(socialKind('https://www.instagram.com/p/x/')).toBe('instagram')
    expect(socialKind('https://example.com')).toBeNull()
    expect(EXPANDED_LINKS).toBe(1)
    const card = readFileSync('src/components/timeline/post-card.tsx', 'utf8')
    expect(card).toMatch(/\.slice\(0, EXPANDED_LINKS\)/)
    expect(card).not.toContain('LinkCarousel')
  })

  it('shared cache: RPC-only, no overwrite of a fresh row, capped writes; cached rows re-validated', () => {
    const sql = readFileSync('supabase/migrations/0109_link_preview_cache.sql', 'utf8')
    expect(sql).toContain('revoke all on public.link_preview_cache from public, anon, authenticated')
    expect(sql).toContain('where c.expires_at <= now()')
    expect(sql).toMatch(/>= 120 then\s+return false/)
    const server = readFileSync('src/lib/link-preview-server.ts', 'utf8')
    expect(server).toMatch(/LINK_TYPES as readonly string\[\]\)\.includes/)
  })

  it('real path (dev): a post with two links keeps one preview', async () => {
    const body = 'two links https://github.com/vercel/ai and https://toss.tech/article/frontend-remote-deploy'
    const r = await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, urls: ['https://github.com/vercel/ai', 'https://toss.tech/article/frontend-remote-deploy'] }) })
    expect(r.status).toBe(201)
    const d = await r.json()
    const post = d.post ?? d
    expect((post.linkPreviews ?? []).length).toBeLessThanOrEqual(1)
  })
})
