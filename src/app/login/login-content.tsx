'use client'

import { startGoogleSignIn } from '@/lib/google-sign-in'
import { useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { Slogan } from '@/components/slogan'
import { Suspense, useEffect, useSyncExternalStore } from 'react'
import { useT, tx } from '@/i18n/client'
import { LocaleSwitch } from '@/components/i18n/locale-switch'
import { AFTER_LOGIN_COOKIE, safeNextPath } from '@/lib/handoff-rules'
import { IN_APP_LABEL, detectInApp, externalOpenUrl } from '@/lib/in-app-browser'
import { toast } from 'sonner'

const noSubscribe = () => () => {}
/** the webview we're in (client only; the server renders the normal screen) */
function useInApp() {
  return useSyncExternalStore(noSubscribe, () => detectInAppOnce(), () => null)
}
let inAppMemo: ReturnType<typeof detectInApp> | undefined
const detectInAppOnce = () => (inAppMemo === undefined ? (inAppMemo = detectInApp(navigator.userAgent)) : inAppMemo)

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const t = useT()
  const inApp = useInApp()
  const external = inApp && typeof window !== 'undefined' ? externalOpenUrl(inApp, window.location.href) : null
  // KakaoTalk: Google sign-in can't work in its webview, so reopen this page (next= included) in the browser
  useEffect(() => {
    if (inApp?.app === 'kakaotalk' && external) window.location.href = external
  }, [inApp, external])

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success(tx('링크를 복사했어요'))
    } catch {
      toast.error(tx('복사하지 못했어요.'))
    }
  }

  async function handleGoogleLogin() {
    // A25: a shared link that sent them here opens after sign-in (/auth/callback reads this)
    const next = safeNextPath(searchParams.get('next'))
    if (next) document.cookie = `${AFTER_LOGIN_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=600; samesite=lax; secure`
    await startGoogleSignIn()
  }

  // the wrapper (.auth-hero, plain or the landing's #login column) comes from LandingLayout
  return (
    <>
      <div className="auth-hero-brand">
        <Image
          src="/images/logo-white.png"
          alt={tx('AI쓰발')}
          width={240}
          height={72}
          priority
          className="auth-hero-logo auth-hero-logo-lg"
        />
        <Slogan />
      </div>

      <div className="auth-hero-actions">
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm text-center">
            {t('로그인에 실패했습니다. 다시 시도해주세요.')}
          </div>
        )}

        {inApp ? (
          // Google blocks sign-in inside app webviews (disallowed_useragent)
          <div className="auth-inapp" role="status">
            <p className="auth-inapp-title">{t('{app} 안에서는 Google 로그인이 막혀 있어요.', { app: t(IN_APP_LABEL[inApp.app]) })}</p>
            {external ? (
              <>
                <p className="auth-inapp-hint">{t('외부 브라우저에서 열면 로그인한 뒤 바로 이 글로 이동해요.')}</p>
                <a href={external} className="auth-hero-btn">{t('외부 브라우저로 열기')}</a>
              </>
            ) : (
              <>
                <p className="auth-inapp-hint">{t("오른쪽 아래(또는 위) ⋯ 메뉴에서 'Safari로 열기'를 누르거나, 링크를 복사해 Safari에 붙여넣어 주세요.")}</p>
                <button type="button" onClick={copyLink} className="auth-hero-btn">{t('링크 복사')}</button>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={handleGoogleLogin} className="auth-hero-btn">
            <GoogleIcon />
            {t('Google로 로그인')}
          </button>
        )}
      </div>
      <div className="auth-hero-locale locale-on-dark">
        <LocaleSwitch />
      </div>
    </>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export function LoginScreen() {
  return (
    <Suspense fallback={<div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#fff' }}></div>}>
      <LoginContent />
    </Suspense>
  )
}
