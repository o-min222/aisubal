import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyStarter, isPostImagePath, kstDate, parseQuestionTag, questionIndex, questionText, quickShouldSubmit, QUICK_STARTERS } from '@/lib/quick-post-rules'

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:43256'
const starters = QUICK_STARTERS.filter((s) => s.prefill).map((s) => s.prefill!)

describe('A62 quick post rules', () => {
  it('four chips; only the screenshot one has no sentence', () => {
    expect(QUICK_STARTERS.map((s) => s.id)).toEqual(['ask', 'tried', 'chat', 'shot'])
    expect(QUICK_STARTERS.find((s) => s.id === 'shot')!.prefill).toBeNull()
  })
  it('a starter replaces another starter and keeps what was typed', () => {
    const [ask, tried] = starters
    expect(applyStarter('', ask, starters)).toBe(ask)
    expect(applyStarter('클로드 좋아요', tried, starters)).toBe(`${tried}클로드 좋아요`)
    expect(applyStarter(`${ask}클로드 좋아요`, tried, starters)).toBe(`${tried}클로드 좋아요`)
  })
  it('Enter posts; Shift+Enter, IME composition and empty text never do', () => {
    expect(quickShouldSubmit({ key: 'Enter', shiftKey: false }, 'hi')).toBe(true)
    expect(quickShouldSubmit({ key: 'Enter', shiftKey: true }, 'hi')).toBe(false)
    expect(quickShouldSubmit({ key: 'Enter', shiftKey: false, isComposing: true }, '한글')).toBe(false)
    expect(quickShouldSubmit({ key: 'Enter', shiftKey: false }, '   ')).toBe(false)
  })
  it('image paths must be in your own folder', () => {
    const me = '11111111-1111-1111-1111-111111111111'
    const f = '22222222-2222-2222-2222-222222222222'
    expect(isPostImagePath(`${me}/${f}.png`, me)).toBe(true)
    expect(isPostImagePath(`${f}/${f}.png`, me)).toBe(false)
    expect(isPostImagePath(`${me}/../x.png`, me)).toBe(false)
    expect(isPostImagePath(`${me}/${f}.svg`, me)).toBe(false)
  })
  it('the question rotates by KST date like the DB, and shows in the reader’s language', () => {
    expect(questionIndex('2026-01-01', 30)).toBe(0)
    expect(questionIndex('2026-01-31', 30)).toBe(0)
    expect(questionIndex('2026-11-24', 30)).toBe(27) // the dry run got sort 280 = index 27 on this date
    expect(questionIndex('2025-12-31', 30)).toBe(29)
    expect(kstDate(new Date('2026-11-23T15:30:00Z'))).toBe('2026-11-24')
    expect(questionText({ ko: '질문', en: 'Q' }, 'en')).toBe('Q')
    expect(questionText({ ko: '질문', en: null }, 'en')).toBe('질문')
    expect(parseQuestionTag({ id: 'a', ko: 'k', date: '2026-11-24' })).toEqual({ id: 'a', ko: 'k', en: null, date: '2026-11-24' })
    expect(parseQuestionTag({ ko: 'k' })).toBeNull()
  })
  it('0112: private bucket read through posts RLS; the DB guards the tag and the path; grants are explicit', () => {
    const sql = readFileSync('supabase/migrations/0112_quick_post.sql', 'utf8')
    expect(sql).toMatch(/values \('post-images', 'post-images', false/)
    expect(sql).toMatch(/exists \(select 1 from public\.posts p where p\.image_path = name and p\.deleted_at is null\)/)
    expect(sql).toMatch(/raise exception 'post_image_invalid'/)
    expect(sql).toMatch(/grant insert \(daily_question_id, image_path\) on public\.posts to authenticated/)
    expect(sql).toMatch(/revoke all on function public\.daily_question_today\(\) from public, anon;/)
    expect(sql.split('\n').filter((l) => /^  \('.+', \d+\),?$/.test(l)).length).toBe(30)
  })
})

describe('A62 real path (dev)', () => {
  it('answer today’s question in one line → the post carries the tag', async () => {
    const q = (await (await fetch(`${BASE_URL}/api/daily-question`)).json()).question
    expect(q?.id).toBeTruthy()
    const body = `A62 vitest ${Date.now()}`
    const res = await fetch(`${BASE_URL}/api/feed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, dailyQuestionId: q.id }) })
    expect(res.status).toBe(201)
    const { posts } = await (await fetch(`${BASE_URL}/api/feed?scope=all`)).json()
    const mine = posts.find((p: { body: string }) => p.body === body)
    expect(mine?.question?.id).toBe(q.id)
    const after = (await (await fetch(`${BASE_URL}/api/daily-question`)).json()).question
    expect(after.answered).toBe(true)
  })
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
