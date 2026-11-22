import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'http://localhost:43256'
const OUT = '/opt/cursor/artifacts'

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch()
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await desktop.newPage()

  // Feed — link previews + top padding
  await page.goto(`${BASE}/feed`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/feed-link-previews.png`, fullPage: true })
  // Crop toss card area if present
  const toss = page.locator('.link-card').filter({ hasText: /토스|toss/i }).first()
  if (await toss.count()) {
    await toss.screenshot({ path: `${OUT}/feed-toss-link-fallback.png` })
    console.log('✓ feed-toss-link-fallback.png')
  }
  console.log('✓ feed-link-previews.png')

  // Archive — populated second brain + select item for Use in my AI
  await page.goto(`${BASE}/archive`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=세컨드 브레인')
  await page.waitForTimeout(500)
  const article = page.locator('article.feed-item').first()
  await article.click()
  await page.waitForSelector('text=Use in my AI')
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${OUT}/archive-brain-list.png`, fullPage: true })
  console.log('✓ archive-brain-list.png')

  // Collection selected → Use in my AI + 팩보내기
  await page.locator('button.left-nav-item', { hasText: '에이전트 스택' }).click()
  await page.waitForTimeout(700)
  await page.waitForSelector('text=팩보내기')
  await page.screenshot({ path: `${OUT}/archive-collection-export.png`, fullPage: true })
  console.log('✓ archive-collection-export.png')

  // Composer with profile switcher
  await page.goto(`${BASE}/posts/new`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/composer-profile-switcher.png`, fullPage: true })
  console.log('✓ composer-profile-switcher.png')

  // Settings unlocked (default in DEV)
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/settings-nickname-unlocked.png`, fullPage: true })
  console.log('✓ settings-nickname-unlocked.png')

  // Settings locked preview
  await page.goto(`${BASE}/settings?preview=locked`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/settings-nickname-locked.png`, fullPage: true })
  console.log('✓ settings-nickname-locked.png')

  await browser.close()

  const mobileBrowser = await chromium.launch()
  const mobile = await mobileBrowser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  })
  const mpage = await mobile.newPage()
  await mpage.goto(`${BASE}/archive`, { waitUntil: 'networkidle' })
  await mpage.waitForTimeout(600)
  await mpage.screenshot({ path: `${OUT}/archive-brain-mobile.png`, fullPage: true })
  console.log('✓ archive-brain-mobile.png')

  await mpage.goto(`${BASE}/feed`, { waitUntil: 'networkidle' })
  await mpage.waitForTimeout(600)
  await mpage.screenshot({ path: `${OUT}/feed-mobile.png`, fullPage: true })
  console.log('✓ feed-mobile.png')

  await mobileBrowser.close()
  console.log('Done →', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
