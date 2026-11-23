#!/usr/bin/env node
// A20: Lighthouse per page × form factor → one JSON + a table, so before/after runs compare like for like.
// usage: node scripts/perf-audit.mjs --base http://127.0.0.1:43212 --out /path/run.json [--runs 2] [--pages /,/feed]
// Takes the median of --runs per cell. Needs Chrome (CHROME_PATH or Playwright's Chromium).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const base = arg('base', 'http://127.0.0.1:43212')
const out = arg('out', null)
const runs = Number(arg('runs', '2'))
const pages = arg('pages', '/,/feed,/gallery,/members/me,/notifications').split(',')
const chrome = process.env.CHROME_PATH || (() => {
  const root = join(homedir(), '.cache/ms-playwright')
  const dir = existsSync(root) && readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop()
  return dir ? join(root, dir, 'chrome-linux64/chrome') : undefined
})()

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
const tmp = mkdtempSync(join(tmpdir(), 'lh-'))
const rows = []
for (const page of pages) for (const ff of ['mobile', 'desktop']) {
  const samples = []
  for (let r = 0; r < runs; r++) {
    const file = join(tmp, `r.json`)
    const flags = ['-y', 'lighthouse@13', base + page, '--quiet', '--output=json', `--output-path=${file}`, '--only-categories=performance',
      '--chrome-flags=--headless=new --no-sandbox', ...(ff === 'desktop' ? ['--preset=desktop'] : [])]
    execFileSync('npx', flags, { stdio: 'ignore', env: { ...process.env, CHROME_PATH: chrome } })
    const j = JSON.parse(readFileSync(file, 'utf8'))
    const a = j.audits
    const items = a['resource-summary']?.details?.items ?? []
    const kb = (t) => Math.round((items.find((i) => i.resourceType === t)?.transferSize ?? 0) / 1024)
    samples.push({
      score: Math.round((j.categories.performance.score ?? 0) * 100),
      fcp: Math.round(a['first-contentful-paint'].numericValue),
      lcp: Math.round(a['largest-contentful-paint'].numericValue),
      tbt: Math.round(a['total-blocking-time'].numericValue),
      cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(3)),
      ttfb: Math.round(a['server-response-time']?.numericValue ?? 0),
      jsKB: kb('script'),
      totalKB: kb('total'),
    })
  }
  const row = { page, ff }
  for (const k of Object.keys(samples[0])) row[k] = median(samples.map((s) => s[k]))
  rows.push(row)
  console.log(JSON.stringify(row))
}
if (out) writeFileSync(out, JSON.stringify({ base, runs, at: new Date().toISOString(), rows }, null, 2))
console.table(rows)
