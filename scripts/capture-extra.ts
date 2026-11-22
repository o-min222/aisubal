import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE = process.env.APP_URL || 'http://127.0.0.1:43256'
const ARTIFACTS = '/opt/cursor/artifacts'
const DOCS = path.join(process.cwd(), 'docs/screenshots/redesign-v3')

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  fs.mkdirSync(DOCS, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const pages = [
    ['settings', '/settings'],
    ['composer', '/posts/new'],
  ] as const

  for (const [name, route] of pages) {
    for (const [label, width, height] of [
      ['desktop', 1440, 900],
      ['mobile', 390, 844],
    ] as const) {
      const context = await browser.newContext({
        viewport: { width, height },
      })
      const page = await context.newPage()
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle', timeout: 60000 })
      await page.waitForTimeout(800)
      const filename = `after-${name}-${label}.png`
      const buf = await page.screenshot({ fullPage: true })
      fs.writeFileSync(path.join(ARTIFACTS, filename), buf)
      fs.writeFileSync(path.join(DOCS, filename), buf)
      console.log('saved', filename)
      await context.close()
    }
  }
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
