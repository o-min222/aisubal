import { chromium } from 'playwright'

const REFERENCE_DIR = './docs/screenshots/redesign-v3/reference'
const ARTIFACTS_DIR = '/opt/cursor/artifacts'

async function main() {
  const browser = await chromium.launch({ headless: true })
  
  // Desktop viewport (1440px)
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  })
  const desktopPage = await desktopContext.newPage()

  // Mobile viewport (390px)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 }
  })
  const mobilePage = await mobileContext.newPage()

  console.log('Capturing reference screenshots...\n')

  // Disquiet
  console.log('=== DISQUIET ===')
  
  await desktopPage.goto('https://disquiet.io', { waitUntil: 'networkidle', timeout: 30000 })
  await desktopPage.screenshot({ path: `${REFERENCE_DIR}/disquiet-home-desktop.png`, fullPage: false })
  await desktopPage.screenshot({ path: `${ARTIFACTS_DIR}/ref-disquiet-home-desktop.png`, fullPage: false })
  console.log('✓ Disquiet home (desktop)')

  await mobilePage.goto('https://disquiet.io', { waitUntil: 'networkidle', timeout: 30000 })
  await mobilePage.screenshot({ path: `${REFERENCE_DIR}/disquiet-home-mobile.png`, fullPage: false })
  await mobilePage.screenshot({ path: `${ARTIFACTS_DIR}/ref-disquiet-home-mobile.png`, fullPage: false })
  console.log('✓ Disquiet home (mobile)')

  // Click on a product if available
  try {
    const productLink = await desktopPage.$('a[href^="/product/"]')
    if (productLink) {
      await productLink.click()
      await desktopPage.waitForLoadState('networkidle')
      await desktopPage.screenshot({ path: `${REFERENCE_DIR}/disquiet-product-desktop.png`, fullPage: false })
      await desktopPage.screenshot({ path: `${ARTIFACTS_DIR}/ref-disquiet-product-desktop.png`, fullPage: false })
      console.log('✓ Disquiet product detail (desktop)')
    }
  } catch (e) {
    console.log('⚠ Could not capture Disquiet product detail')
  }

  // Product Hunt
  console.log('\n=== PRODUCT HUNT ===')
  
  await desktopPage.goto('https://www.producthunt.com', { waitUntil: 'networkidle', timeout: 30000 })
  await desktopPage.screenshot({ path: `${REFERENCE_DIR}/producthunt-home-desktop.png`, fullPage: false })
  await desktopPage.screenshot({ path: `${ARTIFACTS_DIR}/ref-producthunt-home-desktop.png`, fullPage: false })
  console.log('✓ Product Hunt home (desktop)')

  await mobilePage.goto('https://www.producthunt.com', { waitUntil: 'networkidle', timeout: 30000 })
  await mobilePage.screenshot({ path: `${REFERENCE_DIR}/producthunt-home-mobile.png`, fullPage: false })
  await mobilePage.screenshot({ path: `${ARTIFACTS_DIR}/ref-producthunt-home-mobile.png`, fullPage: false })
  console.log('✓ Product Hunt home (mobile)')

  // Click on a product if available
  try {
    const productLink = await desktopPage.$('[data-test="post-item-name"]')
    if (productLink) {
      await productLink.click()
      await desktopPage.waitForLoadState('networkidle')
      await desktopPage.screenshot({ path: `${REFERENCE_DIR}/producthunt-product-desktop.png`, fullPage: false })
      await desktopPage.screenshot({ path: `${ARTIFACTS_DIR}/ref-producthunt-product-desktop.png`, fullPage: false })
      console.log('✓ Product Hunt product detail (desktop)')
    }
  } catch (e) {
    console.log('⚠ Could not capture Product Hunt product detail')
  }

  await browser.close()
  console.log('\n✅ Reference screenshots saved!')
}

main().catch(console.error)
