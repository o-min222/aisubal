#!/usr/bin/env node
/**
 * Overflow check: every main route at 375/390/768/1024/1280/1440 (light + dark).
 * Fails when the document scrolls sideways or a card/composer/row is wider than
 * its box (content clipped or poking out). Saves a screenshot per route × width.
 *
 *   npm run dev            # DEV_BYPASS_AUTH=true, mock data
 *   npm run check:overflow -- [--base http://localhost:43210] [--out .overflow-shots] [--only /anon] [--themes light,dark]
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
  '/me', '/settings', '/connect', '/agents', '/network', '/invites', '/posts/new',
]
// boxes that must never be wider than themselves
const BOXES = '.card, .composer, .timeline-card, .crow, .profile-card, .archive-guide, .reading-pane, .sheet, .app-center, .chip-bar, .composer-foot, [data-overflow-check]'

mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const problems = []
let checked = 0
for (const theme of THEMES) {
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
await browser.close()
console.log(`\n${checked} pages checked, ${problems.length} with overflow. Screenshots: ${OUT}/`)
process.exit(problems.length ? 1 : 0)
