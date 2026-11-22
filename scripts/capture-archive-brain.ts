import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:43256'
const ARTIFACTS = '/opt/cursor/artifacts'
const DOCS = path.join(process.cwd(), 'docs/screenshots/archive-brain')

async function shot(page: import('playwright').Page, url: string, name: string) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(500)
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  fs.mkdirSync(DOCS, { recursive: true })
  const a = path.join(ARTIFACTS, `${name}.png`)
  await page.screenshot({ path: a, fullPage: true })
  fs.copyFileSync(a, path.join(DOCS, `${name}.png`))
  console.log('✓', name)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await shot(page, `${BASE_URL}/archive`, 'archive-brain-list')
  // click first item if present
  const first = page.locator('.feed-item').first()
  if (await first.count()) {
    await first.click()
    await page.waitForTimeout(400)
    const a = path.join(ARTIFACTS, 'archive-brain-detail.png')
    await page.screenshot({ path: a, fullPage: true })
    fs.copyFileSync(a, path.join(DOCS, 'archive-brain-detail.png'))
    console.log('✓ archive-brain-detail')
  }
  await shot(page, `${BASE_URL}/posts/post-1`, 'archive-save-on-post')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot(page, `${BASE_URL}/archive`, 'archive-brain-mobile')
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
