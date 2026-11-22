import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

const BASE_URL = 'http://localhost:43210'
const SCREENSHOT_DIR = path.join(process.cwd(), 'docs/screenshots')

async function main() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await context.newPage()

  console.log('1. 랜딩 페이지 캡처...')
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '1-landing.png'), fullPage: false })

  console.log('2. 로그인 페이지 캡처...')
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '2-login.png'), fullPage: false })

  console.log('3. 로그인 중...')
  await page.fill('#email', 'admin@aisubal.local')
  await page.fill('#password', 'admin1234')
  await page.click('button[type="submit"]')
  await page.waitForURL(`${BASE_URL}/feed`, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
  
  console.log('4. 피드 페이지 캡처...')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '3-feed.png'), fullPage: false })

  console.log('5. 게시물 상세 페이지 캡처...')
  const postLink = page.locator('a[href^="/posts/"]').first()
  if (await postLink.count() > 0) {
    await postLink.click()
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '4-post-detail.png'), fullPage: false })
  }

  console.log('6. 새 게시물 페이지 캡처...')
  await page.goto(`${BASE_URL}/posts/new`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '5-new-post.png'), fullPage: false })

  console.log('7. 아카이브 페이지 캡처...')
  await page.goto(`${BASE_URL}/archive`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '6-archive.png'), fullPage: false })

  console.log('8. 설정 페이지 캡처...')
  await page.goto(`${BASE_URL}/settings`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '7-settings.png'), fullPage: false })

  console.log('9. 초대 페이지 캡처...')
  await page.goto(`${BASE_URL}/invites`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '8-invites.png'), fullPage: false })

  console.log('10. 관리자 페이지 캡처...')
  await page.goto(`${BASE_URL}/admin`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, '9-admin.png'), fullPage: false })

  await browser.close()
  console.log(`\n✅ 스크린샷이 ${SCREENSHOT_DIR}에 저장되었습니다.`)
}

main().catch(console.error)
