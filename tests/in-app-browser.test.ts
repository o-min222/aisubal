import { describe, expect, it } from 'vitest'
import { detectInApp, externalOpenUrl } from '@/lib/in-app-browser'

const KAKAO_ANDROID = 'Mozilla/5.0 (Linux; Android 12; SM-G991N Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/94.0.4606.85 Mobile Safari/537.36;KAKAOTALK 2410130'
const KAKAO_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.4.5'
const INSTA_ANDROID = 'Mozilla/5.0 (Linux; Android 13; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36 Instagram 300.0.0.0'
const INSTA_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0'
const CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const URL_ = 'https://aisubal.vercel.app/login?next=%2Fposts%2Fabc'

describe('in-app browsers (A25)', () => {
  it('recognises the webviews Google blocks, not real browsers', () => {
    expect(detectInApp(KAKAO_ANDROID)).toEqual({ app: 'kakaotalk', os: 'android' })
    expect(detectInApp(KAKAO_IOS)).toEqual({ app: 'kakaotalk', os: 'ios' })
    expect(detectInApp(INSTA_ANDROID)?.app).toBe('instagram')
    expect(detectInApp('Mozilla/5.0 [FBAN/FBIOS;FBAV/400.0]')?.app).toBe('facebook')
    expect(detectInApp('Mozilla/5.0 Line/13.1.0')?.app).toBe('line')
    expect(detectInApp(CHROME)).toBeNull()
  })
  it('KakaoTalk (both OS) reopens the same URL, next included, in the system browser', () => {
    const out = externalOpenUrl({ app: 'kakaotalk', os: 'android' }, URL_)
    expect(out).toBe(`kakaotalk://web/openExternal?url=${encodeURIComponent(URL_)}`)
    expect(decodeURIComponent(out!.split('url=')[1])).toBe(URL_)
  })
  it('other Android webviews hand off to Chrome, with a fallback to the page', () => {
    const out = externalOpenUrl(detectInApp(INSTA_ANDROID)!, URL_)!
    expect(out.startsWith('intent://aisubal.vercel.app/login?next=%2Fposts%2Fabc#Intent;scheme=https;package=com.android.chrome;')).toBe(true)
    expect(out).toContain(`S.browser_fallback_url=${encodeURIComponent(URL_)}`)
  })
  it('iOS webviews (not Kakao) need the manual step', () => {
    expect(externalOpenUrl(detectInApp(INSTA_IOS)!, URL_)).toBeNull()
  })
})
