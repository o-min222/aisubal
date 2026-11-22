#!/usr/bin/env node
/**
 * Overflow check: every main route at 375/390/768/1024/1280/1440 (light + dark).
 * Fails when the document scrolls sideways or a card/composer/row is wider than
 * its box (content clipped or poking out). Saves a screenshot per route × width.
 *
 *   npm run dev            # DEV_BYPASS_AUTH=true, mock data
 *   npm run check:overflow -- [--base http://localhost:43210] [--out .overflow-shots] [--only /anon] [--themes light,dark]
 *                              [--stability-only] [--no-stability]
 *
 * Layout stability: at 1024/1280/1440 it clicks through every sidebar tab (plus the
 * 사람|AI switch and the profile card) with client-side navigation and asserts the
 * center column's x and width are identical on every route, also while the next
 * page is loading (sampled every frame), so switching tabs never shifts the layout.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const BASE = arg('base', process.env.TEST_BASE_URL || 'http://localhost:43210')
const OUT = arg('out', '.overflow-shots')
const ONLY = arg('only', null)
const THEMES = arg('themes', 'light').split(',')
const WIDTHS = [375, 390, 768, 1024, 1280, 1440]
export const ROUTES = [
  '/feed', '/agora', '/anon', '/tools', '/moim', '/groups', '/archive', '/archive?open=arc-1',
  '/me', '/settings', '/settings/profile', '/agents', '/agents/connect', '/network', '/invites', '/posts/new', '/u/dev',
]
// boxes that must never be wider than themselves
const BOXES = '.card, .composer, .timeline-card, .crow, .profile-card, .archive-guide, .reading-pane, .sheet, .app-center, .chip-bar, .composer-foot, [data-overflow-check]'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const problems = []
let checked = 0
const STABILITY_ONLY = process.argv.includes('--stability-only')
for (const theme of STABILITY_ONLY ? [] : THEMES) {
  for (const route of ONLY ? ONLY.split(',') : ROUTES) {
    for (const width of WIDTHS) {
      const mobile = width < 768
      const ctx = await browser.newContext({ viewport: { width, height: mobile ? 844 : 900 }, isMobile: mobile, hasTouch: mobile, colorScheme: theme === 'dark' ? 'dark' : 'light' })
      await ctx.addCookies([
        { name: 'dev_pledge', value: '1', url: BASE },
        { name: 'locale', value: 'ko', url: BASE },
        { name: 'theme', value: theme, url: BASE },
      ])
      const page = await ctx.newPage()
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle' }).catch((e) => ({ status: () => String(e).slice(0, 80) }))
      await page.waitForTimeout(250)
      const status = res?.status?.()
      if (status === 404) {
        await ctx.close()
        continue
      }
      const found = await page.evaluate((sel) => {
        const out = []
        const d = document.documentElement
        if (d.scrollWidth > d.clientWidth + 1) out.push(`document scrollWidth ${d.scrollWidth} > ${d.clientWidth}`)
        const scrollsX = (el) => {
          for (let p = el.parentElement; p; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX
            if (o === 'auto' || o === 'scroll') return true
          }
          return false
        }
        const name = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : el.tagName.toLowerCase())
        for (const el of document.querySelectorAll(sel)) {
          const cs = getComputedStyle(el)
          if (cs.display === 'none' || cs.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue
          const ox = cs.overflowX
          if (ox === 'auto' || ox === 'scroll') continue
          if (el.scrollWidth > el.clientWidth + 1) out.push(`${name(el)} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`)
          const r = el.getBoundingClientRect()
          if (r.width && r.right > d.clientWidth + 1 && !scrollsX(el) && cs.position !== 'fixed') out.push(`${name(el)} right ${Math.round(r.right)} > viewport ${d.clientWidth}`)
        }
        return [...new Set(out)].slice(0, 8)
      }, BOXES)
      checked++
      const file = `${OUT}/${route.replace(/[/?=&]+/g, '_').replace(/^_|_$/g, '') || 'root'}-${width}${theme === 'light' ? '' : '-' + theme}.png`
      await page.screenshot({ path: file, fullPage: false })
      if (found.length) problems.push({ route, width, theme, found, file })
      process.stdout.write(found.length ? `✗ ${route} @${width} ${theme}\n    ${found.join('\n    ')}\n` : `✓ ${route} @${width} ${theme}\n`)
      await ctx.close()
    }
  }
}
if (!STABILITY_ONLY) console.log(`\n${checked} pages checked, ${problems.length} with overflow. Screenshots: ${OUT}/`)

// ---------------------------------------------------------------- layout stability
const shifts = []
if (!process.argv.includes('--no-stability')) {
  console.log('\nLayout stability (center column x / width while clicking through the sidebar):')
  for (const width of [1024, 1280, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } })
    await ctx.addCookies([{ name: 'dev_pledge', value: '1', url: BASE }, { name: 'locale', value: 'ko', url: BASE }])
    const page = await ctx.newPage()
    await page.goto(BASE + '/feed', { waitUntil: 'networkidle' })
    // the column that holds the page's main content: the list on list+pane pages, else the center
    const measure = () =>
      page.evaluate(() => {
        const rl = document.querySelector('.reading-layout')
        const el = (rl && rl.firstElementChild) || document.querySelector('.app-center')
        const r = el.getBoundingClientRect()
        return { x: Math.round(r.x * 10) / 10, w: Math.round(r.width * 10) / 10, path: location.pathname }
      })
    const ref = await measure()
    const rows = [ref]
    const links = await page.$$eval('.app-left .side-nav a[href], .mode-switch a[href], .app-left a.profile-card-trigger[href], .app-left .profile-card a[href="/me"]', (as) =>
      [...new Set(as.map((a) => a.getAttribute('href')))].filter((h) => h && h.startsWith('/')),
    )
    const order = [...links, '/feed']
    for (const href of order) {
      // sample every frame from the click until the route has settled
      await page.evaluate(() => {
        window.__samples = []
        const tick = () => {
          const rl = document.querySelector('.reading-layout')
          const el = (rl && rl.firstElementChild) || document.querySelector('.app-center')
          if (el) {
            const r = el.getBoundingClientRect()
            window.__samples.push([Math.round(r.x * 10) / 10, Math.round(r.width * 10) / 10])
          }
          window.__raf = requestAnimationFrame(tick)
        }
        tick()
      })
      await page.locator(`.app-left a[href="${href}"], .mode-switch a[href="${href}"]`).first().click()
      await page.waitForURL((u) => u.pathname === href.split('?')[0], { timeout: 15000 }).catch(() => {})
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(300)
      const samples = await page.evaluate(() => (cancelAnimationFrame(window.__raf), window.__samples))
      const m = await measure()
      const transient = samples.filter(([x, w]) => x !== ref.x || w !== ref.w)
      rows.push({ ...m, transient: transient.length ? `${transient.length} frames off (e.g. x=${transient[0][0]} w=${transient[0][1]})` : '' })
    }
    for (const r of rows) {
      const ok = r.x === ref.x && r.w === ref.w && !r.transient
      if (!ok) shifts.push({ width, ...r, ref })
      console.log(`${ok ? '✓' : '✗'} @${width} ${r.path.padEnd(10)} x=${r.x} w=${r.w}${r.transient ? '  ' + r.transient : ''}`)
    }
    await ctx.close()
  }
  console.log(`\n${shifts.length} layout shifts.`)
}
await browser.close()
process.exit(problems.length || shifts.length ? 1 : 0)
