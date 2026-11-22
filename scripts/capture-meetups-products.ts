import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:43256'
const ARTIFACTS = '/opt/cursor/artifacts'
const DOCS = path.join(process.cwd(), 'docs/screenshots/meetups-products')

async function ensureDirs() {
  fs.mkdirSync(ARTIFACTS, { recursive: true })
  fs.mkdirSync(DOCS, { recursive: true })
}

async function shot(
  page: import('playwright').Page,
  url: string,
  name: string
) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(500)
  const artifactPath = path.join(ARTIFACTS, `${name}.png`)
  const docsPath = path.join(DOCS, `${name}.png`)
  await page.screenshot({ path: artifactPath, fullPage: true })
  fs.copyFileSync(artifactPath, docsPath)
  console.log('✓', name)
}

async function main() {
  await ensureDirs()
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  })
  const page = await context.newPage()

  await shot(page, `${BASE_URL}/meetups`, 'meetups-list')
  await shot(page, `${BASE_URL}/meetups/meetup-1`, 'meetups-detail')
  await shot(page, `${BASE_URL}/products`, 'products-list')
  await shot(page, `${BASE_URL}/products/product-1`, 'products-detail')
  await shot(page, `${BASE_URL}/feed`, 'feed-with-sidebars')

  // mobile
  await page.setViewportSize({ width: 390, height: 844 })
  await shot(page, `${BASE_URL}/meetups`, 'meetups-list-mobile')
  await shot(page, `${BASE_URL}/products`, 'products-list-mobile')

  await browser.close()
  console.log('Done. Artifacts in', ARTIFACTS)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
