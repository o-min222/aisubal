import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:43256'
const ARTIFACTS = '/opt/cursor/artifacts'
const DOCS = path.join(process.cwd(), 'docs/screenshots/toolbox')

async function shot(page: import('playwright').Page, url: string, name: string) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(400)
  const a = path.join(ARTIFACTS, `${name}.png`)
  const d = path.join(DOCS, `${name}.png`)
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  fs.mkdirSync(DOCS, { recursive: true })
  await page.screenshot({ path: a, fullPage: true })
  fs.copyFileSync(a, d)
  console.log('✓', name)
}

async function main() {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await shot(page, `${BASE_URL}/toolbox`, 'toolbox-list')
  await shot(page, `${BASE_URL}/toolbox/github-mcp-server`, 'toolbox-detail')
  await shot(page, `${BASE_URL}/toolbox/context7`, 'toolbox-detail-context7')
  await shot(page, `${BASE_URL}/feed`, 'feed-with-toolbox-sidebar')
  await page.setViewportSize({ width: 390, height: 844 })
  await shot(page, `${BASE_URL}/toolbox`, 'toolbox-list-mobile')
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
