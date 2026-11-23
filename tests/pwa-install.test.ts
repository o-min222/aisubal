import { describe, expect, it } from 'vitest'
import { installMode, isIosSafari } from '@/lib/pwa-install'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'

describe('홈 화면에 추가', () => {
  it('detects iOS Safari only (iPadOS desktop UA with touch included, other iOS browsers excluded)', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true)
    expect(isIosSafari(IPAD_DESKTOP_UA, 5)).toBe(true)
    expect(isIosSafari(IPAD_DESKTOP_UA, 0)).toBe(false) // real Mac Safari
    expect(isIosSafari(IPHONE_CHROME)).toBe(false)
    expect(isIosSafari(ANDROID_CHROME)).toBe(false)
  })
  it('prompt when Chromium offered one, iOS sheet on iOS Safari, hidden otherwise', () => {
    expect(installMode({ standalone: false, hasPrompt: true, ua: ANDROID_CHROME })).toBe('prompt')
    expect(installMode({ standalone: false, hasPrompt: false, ua: IPHONE_SAFARI })).toBe('ios')
    expect(installMode({ standalone: false, hasPrompt: false, ua: ANDROID_CHROME })).toBe(null)
    expect(installMode({ standalone: false, hasPrompt: false, ua: FIREFOX })).toBe(null)
  })
  it('hidden once installed', () => {
    expect(installMode({ standalone: true, hasPrompt: true, ua: ANDROID_CHROME })).toBe(null)
    expect(installMode({ standalone: false, installed: true, hasPrompt: false, ua: ANDROID_CHROME })).toBe(null)
    expect(installMode({ standalone: true, hasPrompt: false, ua: IPHONE_SAFARI })).toBe(null)
  })
})

describe('boot script (D1)', () => {
  it('parses, keeps install capture, registers the worker off localhost and marks installs done', async () => {
    const { PWA_BOOT_SCRIPT, APP_SETUP_KEY } = await import('@/lib/pwa-install')
    expect(() => new Function(PWA_BOOT_SCRIPT)).not.toThrow()
    expect(PWA_BOOT_SCRIPT).toContain('beforeinstallprompt')
    expect(PWA_BOOT_SCRIPT).toContain("register('/sw.js'")
    expect(PWA_BOOT_SCRIPT).toContain(APP_SETUP_KEY)
  })
})
