#!/usr/bin/env node
/**
 * UI audit: every page (static + one resolved instance of each dynamic route) at
 * 390/1440 light+dark (ko), 390/1440 en, and 768/1024 light. Per load it records
 * runtime errors, HTTP errors, horizontal overflow, clipped text without an ellipsis,
 * scroll rows whose items are cut at the edge, broken images, and (en) Korean UI
 * chrome left untranslated. Writes <out>/report.json and a screenshot per load.
 *
 *   node scripts/ui-audit.mjs [--base http://localhost:43210] [--out /tmp/ui-audit] [--only /feed,/agora] [--conc 3]
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const BASE = arg('base', process.env.TEST_BASE_URL || 'http://localhost:43210')
const OUT = arg('out', '/tmp/ui-audit')
const ONLY = arg('only', null)
const CONC = Number(arg('conc', '3'))

const STATIC = [
  '/feed', '/feed?scope=for_you', '/feed?scope=following', '/feed?scope=popular', '/agora', '/anon', '/anon/new', '/gallery', '/gallery/new', '/gallery/launch',
  '/gallery/submissions', '/moim', '/moim/new', '/groups', '/groups/new', '/archive', '/me', '/network', '/invites', '/notifications', '/search?q=mcp',
  '/settings', '/settings/account', '/settings/notifications', '/settings/profile', '/settings/profile/nickname', '/settings/tokens', '/agents',
  '/agents/connect', '/connect', '/posts/new', '/posts/new/asset', '/products', '/u/dev', '/admin', '/admin/anon', '/admin/installs', '/admin/invites',
  '/admin/overview', '/admin/reports', '/admin/site', '/admin/tool-reviews', '/admin/users', '/this-page-does-not-exist',
]
// dynamic routes: first matching link found on the listed page
const DYNAMIC = [
  ['/feed', /^\/posts\/[^/?#]+$/], ['/agora', /^\/agora\/[^/?#]+$/], ['/anon', /^\/anon\/(?!new)[^/?#]+$/], ['/gallery', /^\/gallery\/(?!new|launch|submissions)[^/?#]+$/],
  ['/groups', /^\/groups\/(?!new)[^/?#]+$/], ['/moim', /^\/moim\/(?!new)[^/?#]+$/], ['/products', /^\/products\/[^/?#]+$/], ['/agents', /^\/agents\/(?!connect)[^/?#]+$/],
  ['/feed', /^\/members\/[^/?#]+$/],
]
const MATRIX = [
  { w: 390, theme: 'light', loc: 'ko' }, { w: 390, theme: 'dark', loc: 'ko' }, { w: 1440, theme: 'light', loc: 'ko' }, { w: 1440, theme: 'dark', loc: 'ko' },
  { w: 390, theme: 'light', loc: 'en' }, { w: 390, theme: 'dark', loc: 'en' }, { w: 1440, theme: 'light', loc: 'en' }, { w: 1440, theme: 'dark', loc: 'en' }, { w: 768, theme: 'light', loc: 'ko' }, { w: 1024, theme: 'light', loc: 'ko' },
]

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()

async function newCtx({ w, theme, loc }) {
  const mobile = w < 768
  const ctx = await browser.newContext({ viewport: { width: w, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, colorScheme: theme, locale: loc === 'en' ? 'en-US' : 'ko-KR' })
  await ctx.addCookies([{ name: 'dev_pledge', value: '1', url: BASE }, { name: 'theme', value: theme, url: BASE }, { name: 'locale', value: loc, url: BASE }])
  return ctx
}

let routes = STATIC
if (!ONLY) {
  const ctx = await newCtx(MATRIX[2])
  const page = await ctx.newPage()
  const extra = new Set()
  for (const [from, re] of DYNAMIC) {
    await page.goto(BASE + from, { waitUntil: 'networkidle', timeout: 120000 }).catch(() => {})
    const hrefs = await page.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')))
    const hit = hrefs.find((h) => h && re.test(h))
    if (hit) extra.add(hit)
    else console.log('no instance for', re)
  }
  await ctx.close()
  routes = [...STATIC, ...extra, '/members/' + [...extra].find((r) => r.startsWith('/members/'))?.split('/')[2] + '/social'].filter((r) => !r.includes('undefined'))
} else routes = ONLY.split(',')

const jobs = []
for (const r of routes) for (const m of MATRIX) jobs.push({ r, m })
const results = []
const slug = (r) => r.replace(/[^a-z0-9가-힣_-]+/gi, '_').replace(/^_|_$/g, '') || 'root'

async function run({ r, m }) {
  const ctx = await newCtx(m)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e.message).slice(0, 160)))
  page.on('console', (c) => { if (c.type() === 'error' && !/favicon|Failed to load resource|Download the React DevTools/.test(c.text())) errors.push('console: ' + c.text().slice(0, 160)) })
  const res = await page.goto(BASE + r, { waitUntil: 'networkidle', timeout: 120000 }).catch((e) => ({ status: () => 'ERR ' + String(e).slice(0, 60), url: () => '' }))
  await page.waitForTimeout(300)
  const status = res.status()
  const finalUrl = page.url().replace(BASE, '')
  const found = await page.evaluate((loc) => {
    const out = { overflow: null, clipped: [], scrollRows: [], brokenImg: [], hangul: [], overlay: false }
    const d = document.documentElement
    if (d.scrollWidth > d.clientWidth + 1) out.overflow = `${d.scrollWidth}>${d.clientWidth}`
    out.overlay = Boolean(document.querySelector('nextjs-portal')?.shadowRoot?.querySelector('[data-nextjs-dialog], [data-nextjs-toast-errors]'))
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !el.closest('[aria-hidden="true"], .sr-only') }
    const label = (el) => (el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')).slice(0, 60)
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue
      const cs = getComputedStyle(el)
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
      // clipped text: overflow hidden, no ellipsis, not a line clamp, text pokes out
      if (hasText && (cs.overflowX === 'hidden' || cs.overflow === 'hidden') && cs.textOverflow !== 'ellipsis' && cs.webkitLineClamp === 'none' && el.scrollWidth > el.clientWidth + 2)
        out.clipped.push(`${label(el)} "${el.textContent.trim().slice(0, 30)}" ${el.scrollWidth}>${el.clientWidth}`)
      // scroll rows (tabs/chips) that hide items with no visible affordance
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 2 && el.clientHeight < 80) {
        const box = el.getBoundingClientRect()
        const cut = [...el.children].filter((c) => { const b = c.getBoundingClientRect(); return b.left < box.right - 1 && b.right > box.right + 1 })
        out.scrollRows.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}${cut.length ? ' cut:"' + cut[0].textContent.trim().slice(0, 20) + '"' : ''}`)
      }
      if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0 && el.getAttribute('src')) out.brokenImg.push(el.getAttribute('src').slice(0, 80))
    }
    if (loc === 'en') {
      const CHROME = 'button, nav a, h1, h2, h3, h4, label, th, [role="tab"], .rail-title, .badge, .chip, .sheet-row, .empty-title, .empty-hint, p.text-xs, .tab, .link-tab'
      const seen = new Set()
      for (const el of document.querySelectorAll(CHROME)) {
        if (!visible(el) || el.closest('.timeline-card .tc-body, .post-body, .mention, .user-content, [data-user-content], .collapsible-text, .peek-name')) continue
        const t = el.textContent.trim()
        if (/[가-힣]/.test(t) && t.length < 80) seen.add(t.replace(/\s+/g, ' ').slice(0, 50))
      }
      for (const el of document.querySelectorAll('[placeholder], [aria-label], [title]')) {
        for (const a of ['placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && /[가-힣]/.test(v)) seen.add(`${a}=${v.slice(0, 40)}`) }
      }
      out.hangul = [...seen].slice(0, 25)
    }
    out.clipped = [...new Set(out.clipped)].slice(0, 8)
    out.scrollRows = [...new Set(out.scrollRows)].slice(0, 5)
    return out
  }, m.loc)
  const tag = `${slug(r)}@${m.w}-${m.theme}-${m.loc}`
  await page.screenshot({ path: `${OUT}/${tag}.png` }).catch(() => {})
  results.push({ route: r, ...m, status, finalUrl, errors: [...new Set(errors)].slice(0, 5), ...found, shot: `${tag}.png` })
  await ctx.close()
}

let i = 0
await Promise.all(Array.from({ length: CONC }, async () => { while (i < jobs.length) { const j = jobs[i++]; await run(j).catch((e) => results.push({ route: j.r, ...j.m, fatal: String(e).slice(0, 200) })) } }))
await browser.close()
writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1))
const bad = results.filter((x) => x.fatal || x.overflow || x.overlay || x.errors?.length || x.clipped?.length || x.brokenImg?.length || (typeof x.status === 'number' && x.status >= 500))
console.log(`${results.length} loads over ${routes.length} routes; ${bad.length} with issues. Report: ${OUT}/report.json`)
