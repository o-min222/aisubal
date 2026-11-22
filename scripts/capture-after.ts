import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE = process.env.APP_URL || 'http://127.0.0.1:43256'
const ARTIFACTS = '/opt/cursor/artifacts'
const DOCS = path.join(process.cwd(), 'docs/screenshots/redesign-v3')

const PAGES = [
  { name: 'login', path: '/login' },
  { name: 'feed', path: '/feed', waitRelative: true },
  { name: 'post-detail', path: '/posts/post-1', waitRelative: true },
  { name: 'archive', path: '/archive' },
  { name: 'waitlist', path: '/waitlist' },
]

async function ensureDirs() {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  fs.mkdirSync(DOCS, { recursive: true })
}

async function capture() {
  await ensureDirs()
  const browser = await chromium.launch({ headless: true })

  for (const pageDef of PAGES) {
    for (const [label, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width, height },
        deviceScaleFactor: 1,
      })
      const page = await context.newPage()

      await page.goto(`${BASE}${pageDef.path}`, { waitUntil: 'networkidle', timeout: 60000 })

      if (pageDef.waitRelative) {
        await page.waitForFunction(() => {
          const nodes = Array.from(document.querySelectorAll('[data-testid="relative-time"]'))
          return (
            nodes.length > 0 &&
            nodes.every((n) => {
              const t = (n.textContent || '').trim()
              return t.length > 0 && t !== '…' && t !== '방금 전'
            })
          )
        }, { timeout: 10000 }).catch(() => {})
      }

      await page.waitForTimeout(500)

      const filename = `after-${pageDef.name}-${label}.png`
      const buf = await page.screenshot({ fullPage: true })
      fs.writeFileSync(path.join(ARTIFACTS, filename), buf)
      fs.writeFileSync(path.join(DOCS, filename), buf)
      console.log(`saved ${filename}`)
      await context.close()
    }
  }

  await browser.close()
  console.log('done')
}

capture().catch((err) => {
  console.error(err)
  process.exit(1)
})
