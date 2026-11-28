/**
 * A25: Google refuses sign-in inside app webviews (403 disallowed_useragent), so a shared link
 * opened in KakaoTalk / Instagram / … has to hop to the real browser first.
 */
type InAppName = 'kakaotalk' | 'instagram' | 'facebook' | 'line' | 'naver' | 'daum'
type InApp = { app: InAppName; os: 'android' | 'ios' | 'other' }

const APPS: Array<[InAppName, RegExp]> = [
  ['kakaotalk', /KAKAOTALK/i],
  ['instagram', /Instagram/],
  ['facebook', /FBAN|FBAV|FB_IAB/],
  ['line', /\bLine\//],
  ['naver', /NAVER\(inapp|NAVER\/|whale\/.*inapp/i],
  ['daum', /DaumApps|DAUM/],
]

export function detectInApp(ua: string): InApp | null {
  const hit = APPS.find(([, re]) => re.test(ua))
  if (!hit) return null
  const os = /Android/i.test(ua) ? 'android' : /iPhone|iPad|iPod/i.test(ua) ? 'ios' : 'other'
  return { app: hit[0], os }
}

/** A URL that reopens `url` in the system browser, or null where only a manual step works (iOS). */
export function externalOpenUrl(inApp: InApp, url: string): string | null {
  if (inApp.app === 'kakaotalk') return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`
  if (inApp.app === 'line') {
    const u = new URL(url)
    u.searchParams.set('openExternalBrowser', '1')
    return u.toString()
  }
  if (inApp.os === 'android') {
    const u = new URL(url)
    return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`
  }
  return null
}

export const IN_APP_LABEL: Record<InAppName, string> = {
  kakaotalk: '카카오톡',
  instagram: 'Instagram',
  facebook: 'Facebook',
  line: 'LINE',
  naver: '네이버',
  daum: '다음',
}
