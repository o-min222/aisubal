import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p: string) => readFileSync(p, 'utf8')

describe('A114 · re-tap the active tab to scroll and refresh', () => {
  it('shares the pull-to-refresh event so infinite lists reset', () => {
    const h = read('src/components/shell/retap-nav.ts')
    expect(h).toContain('REFRESH_EVENT')
    expect(h).toContain("window.scrollTo({ top: 0, behavior: 'smooth' })")
    expect(h).toContain('router.refresh()')
    expect(h).toContain('pathname !== href')
  })

  it('the bottom tabs, side nav, 사람|AI switch, and logo all retap on the exact page', () => {
    expect(read('src/components/shell/bottom-tabs.tsx')).toContain('onRetap(tab.href, e)')
    expect(read('src/components/shell/side-nav.tsx')).toContain('onRetap(item.href, e)')
    const sw = read('src/components/shell/mode-switch.tsx')
    expect(sw).toContain("onRetap('/feed', e)")
    expect(sw).toContain("onRetap('/agora', e)")
    const logo = read('src/components/shell/top-bar.tsx')
    expect(logo).toContain("onRetap('/feed', e)")
    expect(logo).toContain('feedback.logoClick')
    expect(logo).toContain('e.defaultPrevented')
  })
})
