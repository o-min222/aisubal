import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { LOGO_TAPS, LOGO_TAP_GAP_MS, logoTap, selectorFor, stableClasses, elementTextOf, type NodeLike, type TapState } from '@/lib/feedback-client'
import {
  feedbackMetaSchema,
  feedbackWebhookBody,
  feedbackWebhookConfig,
  feedbackWebhookHeaders,
  progressSignature,
  verifyProgressSignature,
  type FeedbackItem,
} from '@/lib/feedback'

const read = (p: string) => readFileSync(p, 'utf8')

describe('7 taps on the logo', () => {
  function run(times: number[]) {
    let s: TapState = { count: 0, last: 0 }
    return times.map((t) => {
      const step = logoTap(s, t)
      s = step.state
      return step
    })
  }
  it('first tap navigates, hints from the 3rd, toggles on the 7th', () => {
    const steps = run([1000, 1400, 1800, 2200, 2600, 3000, 3400])
    expect(steps.map((s) => s.first)).toEqual([true, false, false, false, false, false, false])
    expect(steps.map((s) => s.remaining)).toEqual([null, null, 4, 3, 2, 1, null])
    expect(steps.map((s) => s.toggle)).toEqual([false, false, false, false, false, false, true])
    expect(LOGO_TAPS).toBe(7)
  })
  it('a gap over 3 s starts over (and that tap navigates again)', () => {
    const steps = run([0, 500, 1000, 1000 + LOGO_TAP_GAP_MS + 1, 5000])
    expect(steps[3]).toMatchObject({ first: true, remaining: null, toggle: false })
    expect(steps[4].state.count).toBe(2)
  })
  it('after toggling the streak resets', () => {
    const steps = run([0, 1, 2, 3, 4, 5, 6, 7])
    expect(steps[6].toggle).toBe(true)
    expect(steps[7]).toMatchObject({ first: true, toggle: false })
  })
})

function node(tag: string, opts: { id?: string; cls?: string[]; attrs?: Record<string, string> } = {}, parent: NodeLike | null = null): NodeLike & { kids: NodeLike[] } {
  const n = {
    tagName: tag.toUpperCase(),
    id: opts.id ?? '',
    classList: opts.cls ?? [],
    parentElement: parent,
    kids: [] as NodeLike[],
    get children() {
      return this.kids
    },
    getAttribute: (k: string) => opts.attrs?.[k] ?? null,
  }
  ;(parent as unknown as { kids?: NodeLike[] } | null)?.kids?.push(n)
  return n
}

describe('selector', () => {
  it('skips utility / hashed classes and stops at a stable id', () => {
    expect(stableClasses(node('div', { cls: ['flex', 'items-center', 'md:px-4', 'post-card', 'w-[18px]', 'css-1x2y3z', 'is-on'] }))).toEqual(['post-card'])
    const body = node('body')
    const main = node('main', { id: 'main', cls: ['app-center'] }, body)
    const card = node('article', { cls: ['post-card', 'p-4'] }, main)
    node('article', { cls: ['post-card'] }, main)
    const btn = node('button', { cls: ['tap-target', 'inline-flex'], attrs: { 'aria-label': '좋아요' } }, card)
    expect(selectorFor(btn)).toBe('#main > article.post-card:nth-of-type(1) > button[aria-label="좋아요"]')
  })
  it('prefers data-ui and returns null for nothing', () => {
    const body = node('body')
    const x = node('section', { attrs: { 'data-ui': 'rail-trending' } }, body)
    expect(selectorFor(x)).toBe('[data-ui="rail-trending"]')
    expect(selectorFor(null)).toBeNull()
  })
  it('element text: aria-label first, collapsed and capped', () => {
    expect(elementTextOf({ getAttribute: (k) => (k === 'aria-label' ? '메뉴 더보기' : null), textContent: 'x' })).toBe('메뉴 더보기')
    expect(elementTextOf({ getAttribute: () => null, textContent: '  두\n  줄  ' })).toBe('두 줄')
    expect(elementTextOf({ getAttribute: () => null, textContent: 'a'.repeat(300) })!.length).toBe(200)
    expect(elementTextOf({ getAttribute: () => null, textContent: '   ' })).toBeNull()
  })
})

describe('submit shape', () => {
  const ok = { body: '버튼이 잘려요', route: '/feed?x=1', viewport: { width: 390, height: 844, dpr: 3 }, theme: 'dark', locale: 'ko', selector: 'main', component: null, elementText: null, bbox: { x: 1, y: 2, width: 3, height: 4, pageX: 1, pageY: 900 } }
  it('accepts a normal pick and refuses empty notes or off-site routes', () => {
    expect(feedbackMetaSchema.safeParse(ok).success).toBe(true)
    expect(feedbackMetaSchema.safeParse({ ...ok, body: '   ' }).success).toBe(false)
    expect(feedbackMetaSchema.safeParse({ ...ok, route: '//evil.example/x' }).success).toBe(false)
    expect(feedbackMetaSchema.safeParse({ ...ok, route: 'https://evil.example' }).success).toBe(false)
    expect(feedbackMetaSchema.safeParse({ ...ok, theme: 'blue' }).success).toBe(false)
  })
})

const ITEM: FeedbackItem = {
  id: '11111111-1111-4111-8111-111111111111', status: 'approved', body: '다크 모드에서 글자가 안 보여요', route: '/feed', viewport: { width: 390, height: 844, dpr: 3 },
  theme: 'dark', locale: 'ko', selector: '#main > button', component: null, elementText: '팔로잉', bbox: { x: 1, y: 2, width: 3, height: 4, pageX: 1, pageY: 2 },
  userAgent: 'UA', hasShot: true, adminNote: '대비만 올려 주세요', reviewedAt: '2026-11-27T00:00:00.000Z', webhookStatus: null, webhookNote: null, webhookAt: null,
  progressNote: null, progressAt: null, createdAt: '2026-11-26T23:00:00.000Z', updatedAt: '2026-11-27T00:00:00.000Z', author: { id: 'm1', name: '테스터', handle: 'tester', avatarUrl: 'x' },
}

describe('dev-request webhook', () => {
  it('is off until both URL and key are set (https only)', () => {
    expect(feedbackWebhookConfig({})).toBeNull()
    expect(feedbackWebhookConfig({ FEEDBACK_WEBHOOK_URL: 'https://hook.example/x' })).toBeNull()
    expect(feedbackWebhookConfig({ FEEDBACK_WEBHOOK_URL: 'http://hook.example/x', FEEDBACK_WEBHOOK_KEY: 'k' })).toBeNull()
    expect(feedbackWebhookConfig({ FEEDBACK_WEBHOOK_URL: 'https://hook.example/x', FEEDBACK_WEBHOOK_KEY: 'k' })).toEqual({ url: 'https://hook.example/x', key: 'k', header: null })
  })
  it('sends Bearer + X-Automation-Key by default, or exactly the configured header', () => {
    const d = feedbackWebhookHeaders({ url: 'u', key: 'k', header: null })
    expect(d).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer k', 'X-Automation-Key': 'k' })
    const x = feedbackWebhookHeaders({ url: 'u', key: 'k', header: 'X-Webhook-Key' })
    expect(x['X-Webhook-Key']).toBe('k')
    expect(x.Authorization).toBeUndefined()
    expect(feedbackWebhookHeaders({ url: 'u', key: 'k', header: 'Authorization' }).Authorization).toBe('Bearer k')
    expect(feedbackWebhookConfig({ FEEDBACK_WEBHOOK_URL: 'https://h.example', FEEDBACK_WEBHOOK_KEY: 'k', FEEDBACK_WEBHOOK_HEADER: 'bad header\n' })!.header).toBeNull()
  })
  it('body carries the context, admin link and screenshot link — no avatar, no secrets', () => {
    const b = feedbackWebhookBody(ITEM, { origin: 'https://aisubal.vercel.app', screenshotUrl: 'https://s.example/sig', screenshotExpiresAt: '2026-11-27T06:00:00.000Z' })
    expect(b).toMatchObject({
      type: 'aisubal.feedback.approved', feedback_id: ITEM.id, comment: ITEM.body, route: '/feed', page_url: 'https://aisubal.vercel.app/feed',
      selector: '#main > button', element_text: '팔로잉', admin_url: `https://aisubal.vercel.app/admin/feedback/${ITEM.id}`,
      screenshot_url: 'https://s.example/sig', progress_url: 'https://aisubal.vercel.app/api/feedback/progress', author: { id: 'm1', name: '테스터', handle: 'tester' },
    })
    expect(JSON.stringify(b)).not.toContain('avatarUrl')
    expect(feedbackWebhookBody(ITEM, { origin: 'o', screenshotUrl: null, screenshotExpiresAt: 'x' }).screenshot_expires_at).toBeNull()
  })
})

describe('sendDevRequest', () => {
  beforeEach(() => {
    vi.stubEnv('DEV_BYPASS_AUTH', 'true')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  it('skips without env and still records it; posts once with the headers when set', async () => {
    const { sendDevRequest } = await import('@/lib/feedback-server')
    const { adminGetFeedback } = await import('@/lib/data/feedback')
    const item = (await adminGetFeedback('00000000-0000-4000-8000-000000000106'))!
    vi.stubEnv('FEEDBACK_WEBHOOK_URL', '')
    vi.stubEnv('FEEDBACK_WEBHOOK_KEY', '')
    const f0 = vi.fn()
    expect(await sendDevRequest(item, f0 as unknown as typeof fetch)).toMatchObject({ status: 'skipped' })
    expect(f0).not.toHaveBeenCalled()
    expect((await adminGetFeedback(item.id))!.webhookStatus).toBe('skipped')

    vi.stubEnv('FEEDBACK_WEBHOOK_URL', 'https://hook.example/automations/webhook/abc')
    vi.stubEnv('FEEDBACK_WEBHOOK_KEY', 'sekret')
    const f1 = vi.fn(async () => new Response('{}', { status: 200 }))
    expect(await sendDevRequest(item, f1 as unknown as typeof fetch)).toEqual({ status: 'sent', note: 'HTTP 200' })
    const [url, init] = f1.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://hook.example/automations/webhook/abc')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sekret')
    expect(JSON.parse(String(init.body)).feedback_id).toBe(item.id)

    const f2 = vi.fn(async () => new Response('no', { status: 401 }))
    expect(await sendDevRequest(item, f2 as unknown as typeof fetch)).toEqual({ status: 'failed', note: 'HTTP 401' })
    const f3 = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    expect(await sendDevRequest(item, f3 as unknown as typeof fetch)).toEqual({ status: 'failed', note: 'network error' })
    expect((await adminGetFeedback(item.id))!.webhookNote).toBe('network error')
  })
})

describe('progress callback signature', () => {
  const secret = 'progress-secret'
  const raw = JSON.stringify({ feedback_id: ITEM.id, status: 'deployed', note: 'A106 · abc1234' })
  const ts = '1795000000'
  it('accepts the right HMAC within 5 minutes only', () => {
    const sig = progressSignature(secret, ts, raw)
    expect(verifyProgressSignature(secret, ts, `sha256=${sig}`, raw, 1795000100)).toBe(true)
    expect(verifyProgressSignature(secret, ts, sig, raw, 1795000100)).toBe(true)
    expect(verifyProgressSignature(secret, ts, `sha256=${sig}`, raw + ' ', 1795000100)).toBe(false)
    expect(verifyProgressSignature(secret, ts, `sha256=${sig}`, raw, 1795000400)).toBe(false)
    expect(verifyProgressSignature('other', ts, `sha256=${sig}`, raw, 1795000000)).toBe(false)
    expect(verifyProgressSignature(undefined, ts, `sha256=${sig}`, raw, 1795000000)).toBe(false)
    expect(verifyProgressSignature(secret, null, `sha256=${sig}`, raw, 1795000000)).toBe(false)
    expect(verifyProgressSignature(secret, ts, 'sha256=zz', raw, 1795000000)).toBe(false)
  })
})

describe('0133 contract', () => {
  const sql = read('supabase/migrations/0133_feedback_items.sql')
  it('table and config are RPC-only; anon gets nothing but the secret-gated callback', () => {
    expect(sql).toMatch(/revoke all on public\.feedback_items from public, anon, authenticated;/)
    expect(sql).toMatch(/revoke all on public\.feedback_config from public, anon, authenticated;/)
    expect(sql).not.toMatch(/grant [a-z, ]+ on public\.feedback_items/)
    const anonGrants = [...sql.matchAll(/grant execute on function ([^\n]+) to anon/g)].map((m) => m[1])
    expect(anonGrants).toEqual(['public.feedback_progress(text, uuid, text, text)'])
    for (const fn of ['admin_feedback_list', 'admin_feedback_get', 'admin_feedback_review', 'admin_feedback_set_status', 'admin_feedback_webhook_result', 'admin_set_feedback_enabled']) {
      expect(sql).toMatch(new RegExp(`function public\\.${fn}\\([\\s\\S]*?app__is_admin\\(\\)`))
    }
    expect(sql).toMatch(/'feedback-shots', 'feedback-shots', false/)
    expect(sql).toMatch(/feedback_rate_limited/)
  })
})

describe('wiring', () => {
  it('logo only counts for allowed members; account menu + Shift+D + pill exist', () => {
    const bar = read('src/components/shell/top-bar.tsx')
    expect(bar).toMatch(/onClick=\{feedback\.allowed \? feedback\.logoClick : undefined\}/)
    const mode = read('src/components/feedback/feedback-mode.tsx')
    expect(mode).toMatch(/e\.key\.toLowerCase\(\) !== 'd' \|\| !e\.shiftKey/)
    expect(mode).toMatch(/className="fb-pill"/)
    expect(read('src/components/shell/account-menu.tsx')).toMatch(/feedback\.allowed && \(/)
    expect(read('src/app/(app)/layout.tsx')).toMatch(/<FeedbackModeProvider allowed=\{Boolean\(me\.feedbackAllowed\)\}>/)
  })
})
