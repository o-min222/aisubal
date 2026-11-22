import { chromium } from 'playwright'

const REFERENCE_DIR = './docs/screenshots/redesign-v3/reference'
const ARTIFACTS_DIR = '/opt/cursor/artifacts'

async function main() {
  const browser = await chromium.launch({ headless: true })
  
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  })
  const desktopPage = await desktopContext.newPage()

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  })
  const mobilePage = await mobileContext.newPage()

  console.log('Capturing Product Hunt...')

  try {
    await desktopPage.goto('https://www.producthunt.com', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await desktopPage.waitForTimeout(5000)
    await desktopPage.screenshot({ path: `${REFERENCE_DIR}/producthunt-home-desktop.png`, fullPage: false })
    await desktopPage.screenshot({ path: `${ARTIFACTS_DIR}/ref-producthunt-home-desktop.png`, fullPage: false })
    console.log('✓ Product Hunt home (desktop)')
  } catch (e) {
    console.log('⚠ Error capturing Product Hunt desktop:', e)
  }

  try {
    await mobilePage.goto('https://www.producthunt.com', { waitUntil: 'domcontentloaded', timeout: 60000 })
    await mobilePage.waitForTimeout(5000)
    await mobilePage.screenshot({ path: `${REFERENCE_DIR}/producthunt-home-mobile.png`, fullPage: false })
    await mobilePage.screenshot({ path: `${ARTIFACTS_DIR}/ref-producthunt-home-mobile.png`, fullPage: false })
    console.log('✓ Product Hunt home (mobile)')
  } catch (e) {
    console.log('⚠ Error capturing Product Hunt mobile:', e)
  }

  await browser.close()
  console.log('Done!')
}

main().catch(console.error)
