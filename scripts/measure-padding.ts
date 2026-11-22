import { chromium } from 'playwright'

async function main() {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } })
  for (const path of ['/feed', '/archive', '/posts/new', '/settings']) {
    await p.goto(`http://127.0.0.1:43256${path}`, { waitUntil: 'networkidle' })
    const m = await p.evaluate(() => {
      const main = document.querySelector('main')
      const header =
        document.querySelector('.site-header') ||
        document.querySelector('header') ||
        document.querySelector('nav')?.parentElement
      const cs = main ? getComputedStyle(main) : null
      const mr = main?.getBoundingClientRect()
      const hr = header?.getBoundingClientRect()
      const first =
        main?.querySelector('h1') ||
        main?.querySelector('.layout-grid') ||
        main?.firstElementChild
      const fr = first?.getBoundingClientRect()
      return {
        paddingTop: cs?.paddingTop,
        mainTop: mr?.top,
        headerBottom: hr?.bottom,
        gapMainToHeader: (mr?.top ?? 0) - (hr?.bottom ?? 0),
        firstContentTop: fr?.top,
        gapContentToHeader: (fr?.top ?? 0) - (hr?.bottom ?? 0),
        mainClass: main?.className,
      }
    })
    console.log(path, JSON.stringify(m))
  }
  await b.close()
}

main()
