import { describe, expect, it } from 'vitest'
import { androidBrowser, installMode, isIosSafari } from '@/lib/pwa-install'
import { readFileSync } from 'node:fs'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
const SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36'
const KAKAO_INAPP = 'Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 KAKAOTALK 10.8.0'
const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0'
const DESKTOP_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'
const FIREFOX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0'

describe('홈 화면에 추가', () => {
  it('detects iOS Safari only (iPadOS desktop UA with touch included, other iOS browsers excluded)', () => {
    expect(isIosSafari(IPHONE_SAFARI)).toBe(true)
    expect(isIosSafari(IPAD_DESKTOP_UA, 5)).toBe(true)
    expect(isIosSafari(IPAD_DESKTOP_UA, 0)).toBe(false) // real Mac Safari
    expect(isIosSafari(IPHONE_CHROME)).toBe(false)
    expect(isIosSafari(ANDROID_CHROME)).toBe(false)
  })
  it('prompt when Chromium offered one, iOS sheet on iOS Safari, menu steps on Android Chrome/Samsung, hidden otherwise', () => {
    expect(installMode({ standalone: false, hasPrompt: true, ua: ANDROID_CHROME })).toBe('prompt')
    expect(installMode({ standalone: false, hasPrompt: false, ua: IPHONE_SAFARI })).toBe('ios')
    // A89: Android Chrome often never fires beforeinstallprompt — the button stays, with the ⋮ steps
    expect(installMode({ standalone: false, hasPrompt: false, ua: ANDROID_CHROME })).toBe('android')
    expect(installMode({ standalone: false, hasPrompt: false, ua: SAMSUNG })).toBe('android')
    expect(installMode({ standalone: false, hasPrompt: false, ua: KAKAO_INAPP })).toBe(null)
    expect(installMode({ standalone: false, hasPrompt: false, ua: ANDROID_FIREFOX })).toBe(null)
    expect(installMode({ standalone: false, hasPrompt: false, ua: DESKTOP_CHROME })).toBe(null)
    expect(installMode({ standalone: false, hasPrompt: false, ua: FIREFOX })).toBe(null)
    expect(installMode({ standalone: false, hasPrompt: false, ua: IPHONE_CHROME })).toBe(null)
  })
  it('names the Android browser for the right menu steps', () => {
    expect(androidBrowser(ANDROID_CHROME)).toBe('chrome')
    expect(androidBrowser(SAMSUNG)).toBe('samsung')
    expect(androidBrowser(KAKAO_INAPP)).toBe(null)
  })
  it('account menu: compact 앱 설치 beside the profile row, no bottom row; manifest lists itself for getInstalledRelatedApps', () => {
    const menu = readFileSync('src/components/shell/account-menu.tsx', 'utf8')
    expect(menu).toMatch(/account-head-row[\s\S]*account-install[\s\S]*'앱 설치'/)
    expect(menu).not.toMatch(/'홈 화면에 추가'/)
    expect(readFileSync('src/app/manifest.ts', 'utf8')).toMatch(/related_applications: \[\{ platform: 'webapp'/)
    expect(readFileSync('src/hooks/use-pwa-install.ts', 'utf8')).toMatch(/getInstalledRelatedApps/)
  })
  it('hidden once installed', () => {
    expect(installMode({ standalone: true, hasPrompt: true, ua: ANDROID_CHROME })).toBe(null)
    expect(installMode({ standalone: false, installed: true, hasPrompt: false, ua: ANDROID_CHROME })).toBe(null)
    expect(installMode({ standalone: true, hasPrompt: false, ua: IPHONE_SAFARI })).toBe(null)
    expect(installMode({ standalone: false, installed: true, hasPrompt: false, ua: SAMSUNG })).toBe(null)
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
