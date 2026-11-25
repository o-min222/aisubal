import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyStarter, isPostImagePath, QUICK_STARTERS } from '@/lib/quick-post-rules'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const starters = QUICK_STARTERS.filter((s) => s.prefill).map((s) => s.prefill!)

describe('A62 quick post rules', () => {
  it('four chips; the screenshot one opens the picker and 질문해요 is a switch (A97): neither types a sentence', () => {
    expect(QUICK_STARTERS.map((s) => s.id)).toEqual(['ask', 'tried', 'chat', 'shot'])
    expect(QUICK_STARTERS.find((s) => s.id === 'shot')!.prefill).toBeNull()
    expect(QUICK_STARTERS.find((s) => s.id === 'ask')!.prefill).toBeNull()
  })
  it('a starter replaces another starter and keeps what was typed', () => {
    const [tried, chat] = starters
    expect(applyStarter('', tried, starters)).toBe(tried)
    expect(applyStarter('클로드 좋아요', tried, starters)).toBe(`${tried}클로드 좋아요`)
    expect(applyStarter(`${tried}클로드 좋아요`, chat, starters)).toBe(`${chat}클로드 좋아요`)
  })
  it('image paths must be in your own folder', () => {
    const me = '11111111-1111-1111-1111-111111111111'
    const f = '22222222-2222-2222-2222-222222222222'
    expect(isPostImagePath(`${me}/${f}.png`, me)).toBe(true)
    expect(isPostImagePath(`${f}/${f}.png`, me)).toBe(false)
    expect(isPostImagePath(`${me}/../x.png`, me)).toBe(false)
    expect(isPostImagePath(`${me}/${f}.svg`, me)).toBe(false)
  })
  it('0112: private bucket read through posts RLS; the DB guards the path; grants are explicit', () => {
    const sql = readFileSync('supabase/migrations/0112_quick_post.sql', 'utf8')
    expect(sql).toMatch(/values \('post-images', 'post-images', false/)
    expect(sql).toMatch(/exists \(select 1 from public\.posts p where p\.image_path = name and p\.deleted_at is null\)/)
    expect(sql).toMatch(/raise exception 'post_image_invalid'/)
    expect(sql).toMatch(/grant insert \(daily_question_id, image_path\) on public\.posts to authenticated/)
  })
})

describe('A62 real path (dev)', () => {
  it('upload one image → post → readable through /api/post-image; a foreign path is refused', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
    const fd = new FormData()
    fd.set('file', new File([png], 'a.png', { type: 'image/png' }))
    const up = await fetch(`${BASE_URL}/api/posts/image`, { method: 'POST', body: fd })
    expect(up.status).toBe(200)
    const { path } = await up.json()
    const body = `A62 image ${Date.now()}`
    const res = await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, imagePath: path }) })
    expect(res.status).toBe(201)
    const { posts } = await (await fetch(`${BASE_URL}/api/feed?scope=all`)).json()
    const mine = posts.find((p: { body: string }) => p.body === body)
    expect(mine?.imageUrl).toMatch(/^\/api\/post-image\//)
    const img = await fetch(`${BASE_URL}${mine.imageUrl}`)
    expect(img.status).toBe(200)
    expect(img.headers.get('content-type')).toBe('image/png')
    const bad = await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body: 'x', imagePath: `00000000-0000-0000-0000-000000000000/${crypto.randomUUID()}.png` }) })
    expect(bad.status).toBe(400)
    const txt = new FormData()
    txt.set('file', new File(['hi'], 'a.txt', { type: 'text/plain' }))
    expect((await fetch(`${BASE_URL}/api/posts/image`, { method: 'POST', body: txt })).status).toBe(400)
  })
})

describe('A63: 오늘의 질문 is gone from the app', () => {
  it('no UI, route or admin editor references it', async () => {
    const { execSync } = await import('node:child_process')
    const hits = execSync("rg -l -i 'daily_question|dailyQuestion|오늘의 질문' src || true", { encoding: 'utf8' }).trim()
    expect(hits).toBe('')
  })
})
