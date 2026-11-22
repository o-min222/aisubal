import { chromium } from 'playwright'

const BASE_URL = 'http://127.0.0.1:43256'
const OUTPUT_DIR = './docs/screenshots/redesign/after'

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  })
  const page = await context.newPage()

  console.log('Taking screenshots...')

  // 1. Landing page (new minimal design)
  await page.goto(BASE_URL)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/1-landing.png`, fullPage: true })
  console.log('✓ Landing page')

  // 2. Login page
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/2-login.png`, fullPage: true })
  console.log('✓ Login page')

  // 3. Invite page
  await page.goto(`${BASE_URL}/invite`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/3-invite.png`, fullPage: true })
  console.log('✓ Invite page')

  // Login as admin for authenticated pages
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.fill('input[type="email"]', 'admin@aisubal.local')
  await page.fill('input[type="password"]', 'admin1234')
  await page.click('button[type="submit"]')
  
  // Wait for redirect with longer timeout
  try {
    await page.waitForURL('**/feed', { timeout: 10000 })
  } catch {
    console.log('Login redirect took too long, navigating directly...')
    await page.goto(`${BASE_URL}/feed`)
  }
  await page.waitForLoadState('networkidle')
  
  // 4. Feed page
  await page.screenshot({ path: `${OUTPUT_DIR}/4-feed.png`, fullPage: true })
  console.log('✓ Feed page')

  // 5. Post detail (if exists)
  const postLink = await page.$('a[href^="/posts/"]')
  if (postLink) {
    await postLink.click()
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `${OUTPUT_DIR}/5-post-detail.png`, fullPage: true })
    console.log('✓ Post detail')
  }

  // 6. New post
  await page.goto(`${BASE_URL}/posts/new`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/6-new-post.png`, fullPage: true })
  console.log('✓ New post')

  // 7. Archive
  await page.goto(`${BASE_URL}/archive`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/7-archive.png`, fullPage: true })
  console.log('✓ Archive')

  // 8. Invites (management)
  await page.goto(`${BASE_URL}/invites`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/8-invites.png`, fullPage: true })
  console.log('✓ Invites')

  // 9. Settings
  await page.goto(`${BASE_URL}/settings`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/9-settings.png`, fullPage: true })
  console.log('✓ Settings')

  // 10. Admin
  await page.goto(`${BASE_URL}/admin`)
  await page.waitForLoadState('networkidle')
  await page.screenshot({ path: `${OUTPUT_DIR}/10-admin.png`, fullPage: true })
  console.log('✓ Admin')

  await browser.close()
  console.log('\nAll screenshots saved to', OUTPUT_DIR)
}

main().catch(console.error)
