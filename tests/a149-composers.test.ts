// @vitest-environment node
/**
 * A149: characterization of the four composer surfaces, written before they share one core.
 * Drives the mock dev server (TEST_BASE_URL, default :43210) in Chromium; every write is intercepted,
 * so nothing is stored. What each surface does today is what it must keep doing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright'

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:43210'
let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch()
}, 60_000)
afterAll(async () => {
  await browser?.close()
})

type Sent = { url: string; body: Record<string, unknown> }
async function open(path: string, reply: Record<string, unknown> = { id: 'char-1', alias: '익명7' }) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR' })
  await ctx.addCookies([{ name: 'dev_pledge', value: '1', url: BASE }, { name: 'aisubal_locale', value: 'ko', url: BASE }])
  const page = await ctx.newPage()
  const sent: Sent[] = []
  await page.route(/\/api\/(feed|anon|articles\/[^/]+\/comments)$/, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    sent.push({ url: new URL(route.request().url()).pathname, body: JSON.parse(route.request().postData() || '{}') })
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) })
  })
  await page.goto(BASE + path, { waitUntil: 'load' })
  await page.waitForTimeout(600)
  return { page, sent, close: () => ctx.close() }
}
const height = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => (el as HTMLElement).getBoundingClientRect().height)
const lines = (n: number) => Array.from({ length: n }, (_, i) => `줄 ${i + 1}`).join('\n')
const PHONE = '연락은 010-1234-5678 로 주세요'

describe('A149 composer characterization', () => {
  it('quick composer (/feed): grows to 160px, Ctrl+Enter posts real/members, send button only with text', async () => {
    const { page, sent, close } = await open('/feed')
    const input = 'section.qc textarea.qc-input'
    await expect(page.locator('section.qc .qc-send').count()).resolves.toBe(0)
    const h0 = await height(page, input)
    await page.fill(input, lines(30))
    const h1 = await height(page, input)
    expect(h1).toBeGreaterThan(h0)
    expect(h1).toBeLessThanOrEqual(161)
    await expect(page.locator('section.qc .qc-send').count()).resolves.toBe(1)
    await page.fill(input, '빠른 글')
    await page.locator(input).press('Control+Enter')
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('/api/feed')
    expect(sent[0].body).toMatchObject({ body: '빠른 글', postedAs: 'real' })
    expect(Object.keys(sent[0].body).sort()).toEqual(['agentInteraction', 'body', 'postedAs', 'visibility'])
    await close()
  }, 60_000)

  it('quick composer: PII needs a second press; 질문해요 adds isQuestion; ⤢ carries the text into the full composer', async () => {
    const { page, sent, close } = await open('/feed')
    const input = 'section.qc textarea.qc-input'
    await page.fill(input, PHONE)
    await expect(page.locator('section.qc .qc-pii').count()).resolves.toBe(1)
    await page.click('section.qc .qc-send')
    await page.waitForTimeout(300)
    expect(sent).toHaveLength(0)
    await page.locator('section.qc .qc-chip', { hasText: '질문' }).first().click()
    await expect(page.locator('section.qc .q-tag').count()).resolves.toBe(1)
    await page.click('section.qc .qc-send')
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toMatchObject({ body: PHONE, isQuestion: true })
    await page.goto(BASE + '/feed', { waitUntil: 'load' })
    await page.fill(input, '이어서 크게')
    await page.click('section.qc button[aria-label="크게 쓰기"]')
    await expect(page.locator('.qc-open textarea.composer-input').inputValue()).resolves.toBe('이어서 크게')
    await close()
  }, 60_000)

  it('full composer (feed): grows to 480px, @ suggests mentions, PII relabels the button, posts with visibility/urls', async () => {
    const { page, sent, close } = await open('/feed')
    await page.click('section.qc button[aria-label="크게 쓰기"]')
    const input = '.qc-open textarea.composer-input'
    const submit = '.qc-open .composer-submit'
    await expect(page.locator(submit).isDisabled()).resolves.toBe(true)
    await expect(page.locator(input).getAttribute('rows')).resolves.toBe('3')
    await expect(page.locator('.qc-open input[type=file]').getAttribute('accept')).resolves.toContain('image/heic')
    await page.fill(input, lines(60))
    const h = await height(page, input)
    expect(h).toBeGreaterThan(200)
    expect(h).toBeLessThanOrEqual(481)
    await page.fill(input, '')
    await page.locator(input).pressSequentially('@d')
    await page.waitForSelector('.mention-pop', { timeout: 5000 })
    await page.fill(input, PHONE)
    await page.click(submit)
    await expect(page.locator(submit).textContent()).resolves.toBe('그래도 게시')
    expect(sent).toHaveLength(0)
    await page.click(submit)
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toMatchObject({ body: PHONE, postedAs: 'real', urls: [] })
    expect(sent[0].body).toHaveProperty('visibility')
    expect(sent[0].body).toHaveProperty('agentInteraction')
    await close()
  }, 60_000)

  it('reply composer (post detail): one compact line, sends parentId, no link previews', async () => {
    const { page, sent, close } = await open('/posts/post-1')
    const input = '.composer-compact textarea.composer-input'
    await expect(page.locator(input).first().getAttribute('rows')).resolves.toBe('1')
    await expect(page.locator(input).first().getAttribute('placeholder')).resolves.toBe('댓글 남기기… @로 태그')
    await page.locator(input).first().fill('댓글 https://example.com')
    await page.locator(input).first().press('Control+Enter')
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toMatchObject({ body: '댓글 https://example.com', parentId: 'post-1' })
    expect(sent[0].body).not.toHaveProperty('urls')
    await close()
  }, 60_000)

  it('group composer: humans-only, group id, the group note instead of visibility', async () => {
    const { page, sent, close } = await open('/groups/founders')
    const input = '.composer textarea.composer-input'
    await expect(page.locator('.composer .composer-note').first().textContent()).resolves.toMatch(/그룹에만 보여요 · 사람만/)
    await page.locator(input).first().fill('그룹 글')
    await page.locator('.composer .composer-submit').first().click()
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toMatchObject({ body: '그룹 글', agentInteraction: 'humans_only' })
    expect(sent[0].body.groupId).toBeTruthy()
    expect(sent[0].body).not.toHaveProperty('visibility')
    await close()
  }, 60_000)

  it('anon composer (/anon/new): a topic is required, PII warns, posts body/category', async () => {
    const { page, sent, close } = await open('/anon/new')
    const input = '.composer textarea.composer-input'
    await page.locator(input).first().fill('익명 고민')
    await page.locator('.composer .composer-submit').first().click()
    await page.waitForTimeout(300)
    expect(sent).toHaveLength(0)
    await expect(page.getByText('주제를 골라주세요.').count()).resolves.toBeGreaterThan(0)
    await page.locator(input).first().fill(PHONE)
    await expect(page.locator('.composer [role=alert]').first().textContent()).resolves.toMatch(/익명 글이어도 신원이 드러날 수 있어요/)
    await close()
  }, 60_000)

  it('anon reply: compact, inherits the thread, posts body/parentId', async () => {
    const { page, sent, close } = await open('/anon')
    // thread ids carry a random suffix in mock mode: open the first thread from the list
    const href = await page.locator('a[href^="/anon/anon-"]').first().getAttribute('href')
    await page.goto(BASE + href, { waitUntil: 'load' })
    await page.waitForTimeout(600)
    const input = '.composer-compact textarea.composer-input'
    await expect(page.locator(input).first().getAttribute('placeholder')).resolves.toMatch(/익명으로 (댓글|답글) 남기기…/)
    await page.locator(input).first().fill('익명 댓글')
    await page.locator('.composer-compact .composer-send').first().click()
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('/api/anon')
    expect(sent[0].body).toMatchObject({ body: '익명 댓글' })
    expect(sent[0].body.parentId).toBeTruthy()
    expect(sent[0].body).not.toHaveProperty('category', expect.anything())
    await close()
  }, 60_000)

  it('article comments: plain 3-row field capped at 2000 chars, no autosize, Ctrl+Enter does not post, 등록 posts trimmed text', async () => {
    const comment = { id: 'c-char', body: '좋은 글', parentId: null, replyToId: null, author: { id: 'dev-user-id', name: '개발자', avatarUrl: null }, isMine: true, deleted: false, createdAt: new Date().toISOString() }
    const { page, sent, close } = await open('/articles/why-agents-fail', { comment })
    const input = '.article-comment-form textarea'
    await expect(page.locator(input).getAttribute('rows')).resolves.toBe('3')
    await expect(page.locator(input).getAttribute('class')).resolves.toBe('input')
    const h0 = await height(page, input)
    await page.fill(input, lines(20))
    expect(await height(page, input)).toBe(h0)
    await page.fill(input, 'x'.repeat(2100))
    await expect(page.locator(input).inputValue()).resolves.toHaveLength(2000)
    await page.fill(input, '  좋은 글  ')
    await page.locator(input).press('Control+Enter')
    await page.waitForTimeout(300)
    expect(sent).toHaveLength(0)
    await page.click('.article-comment-form button[type=submit]')
    await page.waitForTimeout(400)
    expect(sent).toHaveLength(1)
    expect(sent[0].body).toEqual({ body: '좋은 글', parentId: null, replyToId: null })
    await expect(page.locator(input).inputValue()).resolves.toBe('')
    await close()
  }, 60_000)
})
