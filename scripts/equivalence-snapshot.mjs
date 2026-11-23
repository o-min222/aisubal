#!/usr/bin/env node
/**
 * Behavior pin for refactors: snapshot what each page shows and exposes, then diff a later run.
 * Per route at 1440 ko and 390 en (mock data, fresh dev server): visible text, link targets,
 * ARIA roles/labels/states, and form controls. Digits are masked so relative times don't churn.
 * Mock state lives in the dev process, so restart dev before every run; pages that mutate it on view
 * (opening /notifications marks everything read) run in a last phase so they can't leak into the rest.
 *
 *   node scripts/equivalence-snapshot.mjs --out /tmp/eq-base.json [--routes-from /tmp/ui-audit/report.json]
 *   node scripts/equivalence-snapshot.mjs --out /tmp/eq-new.json --compare /tmp/eq-base.json   # exit 1 on any diff
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`)
  return i > 0 ? process.argv[i + 1] : d
}
const BASE = arg('base', process.env.TEST_BASE_URL || 'http://localhost:43210')
const OUT = arg('out', '/tmp/eq.json')
const COMPARE = arg('compare', null)
const FROM = arg('routes-from', COMPARE ? null : '/tmp/ui-audit/report.json')
const routes = COMPARE
  ? Object.keys(JSON.parse(readFileSync(COMPARE, 'utf8'))).map((k) => k.split(' @')[0]).filter((r, i, a) => a.indexOf(r) === i)
  : [...new Set(JSON.parse(readFileSync(FROM, 'utf8')).map((r) => r.route))].sort()
const COMBOS = [{ w: 1440, loc: 'ko' }, { w: 390, loc: 'en' }]

const MUTATES_ON_VIEW = /^\/notifications/
const browser = await chromium.launch()
const snap = {}
for (const phase of [routes.filter((r) => !MUTATES_ON_VIEW.test(r)), routes.filter((r) => MUTATES_ON_VIEW.test(r))]) {
  const jobs = phase.flatMap((r) => COMBOS.map((c) => ({ r, ...c })))
  let i = 0
  await Promise.all(Array.from({ length: 4 }, () => drain(jobs, () => i++)))
}
async function drain(jobs, next) {
  for (let j = next(); j < jobs.length; j = next()) {
    const { r, w, loc } = jobs[j]
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 768, hasTouch: w < 768, locale: loc === 'en' ? 'en-US' : 'ko-KR' })
    await ctx.addCookies([{ name: 'dev_pledge', value: '1', url: BASE }, { name: 'theme', value: 'light', url: BASE }, { name: 'aisubal_locale', value: loc, url: BASE }])
    const page = await ctx.newPage()
    await page.goto(BASE + r, { waitUntil: 'load', timeout: 120000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}) // polling pages never go idle
    await page.waitForTimeout(300)
    snap[`${r} @${w}-${loc}`] = await page.evaluate(() => {
      // the phone-handoff QR row shows live server state (QR, expiry, or the 5-per-10-min limit, which a run's
      // own earlier views use up in a timing-dependent order), so it is pinned as one placeholder
      for (const el of document.querySelectorAll('.app-setup-qr-row')) el.replaceChildren(Object.assign(document.createElement('p'), { textContent: '[handoff QR state]' }))
      // digits (relative times, counts) and the anon mock's random ids/aliases vary per run by design
      const mask = (s) => (s || '').replace(/\s+/g, ' ').trim().replace(/(anon-\d+-)[a-z0-9]{5}/g, '$1*').replace(/익명의 \S+/g, '익명의 *').replace(/\d+/g, '#')
      const vis = (el) => { const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
      const root = document.querySelector('main') || document.body
      return {
        url: location.pathname + location.search,
        title: mask(document.title),
        text: mask(root.innerText),
        links: [...document.querySelectorAll('a[href]')].filter(vis).map((a) => mask(a.getAttribute('href'))),
        aria: [...document.querySelectorAll('[role],[aria-label],[aria-checked],[aria-pressed],[aria-current],[aria-expanded]')].filter(vis)
          .map((e) => [e.getAttribute('role') || e.tagName.toLowerCase(), mask(e.getAttribute('aria-label')), e.getAttribute('aria-checked'), e.getAttribute('aria-pressed'), e.getAttribute('aria-current'), e.getAttribute('aria-expanded')].join('|')),
        controls: [...document.querySelectorAll('input,textarea,select,button')].filter(vis)
          .map((e) => [e.tagName.toLowerCase(), e.type || '', mask(e.getAttribute('name')), mask(e.getAttribute('placeholder')), e.disabled ? 'disabled' : ''].join('|')),
      }
    })
    await ctx.close()
  }
}
await browser.close()
const sorted = Object.fromEntries(Object.entries(snap).sort(([a], [b]) => a.localeCompare(b)))
writeFileSync(OUT, JSON.stringify(sorted, null, 1))
console.log(`${Object.keys(sorted).length} snapshots → ${OUT}`)

if (COMPARE) {
  const base = JSON.parse(readFileSync(COMPARE, 'utf8'))
  let diffs = 0
  for (const [k, b] of Object.entries(base)) {
    const n = sorted[k]
    if (!n) { console.log('MISSING', k); diffs++; continue }
    for (const f of Object.keys(b)) {
      const A = JSON.stringify(b[f]), B = JSON.stringify(n[f])
      if (A === B) continue
      diffs++
      if (Array.isArray(b[f])) {
        const add = n[f].filter((x) => !b[f].includes(x)), del = b[f].filter((x) => !n[f].includes(x))
        console.log(`DIFF ${k} ${f}: +${JSON.stringify(add.slice(0, 4))} -${JSON.stringify(del.slice(0, 4))}${!add.length && !del.length ? ' (order/count)' : ''}`)
      } else {
        let p = 0; while (p < A.length && A[p] === B[p]) p++
        console.log(`DIFF ${k} ${f} @${p}: …${A.slice(Math.max(0, p - 40), p + 60)}… → …${B.slice(Math.max(0, p - 40), p + 60)}…`)
      }
    }
  }
  console.log(diffs ? `${diffs} differences` : 'EQUIVALENT')
  process.exit(diffs ? 1 : 0)
}
