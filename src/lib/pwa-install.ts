/**
 * '홈 화면에 추가': Chromium fires `beforeinstallprompt` (we keep it and call
 * prompt() on one tap); iOS Safari has no prompt, so we explain Share → 홈 화면에 추가.
 * The boot script runs in <head> so an early event is never missed.
 */
/** 'done' after install / opening on the phone, 'later' after 나중에 — drives the 설정 reminder (D1). */
export const APP_SETUP_KEY = 'aisubal_app_setup'

/**
 * Also registers /sw.js (offline page + web push; no caching) and remembers an install as 'done'.
 * Skipped on localhost unless ?sw=1, so dev reloads never fight a worker.
 */
export const PWA_BOOT_SCRIPT =
  "(function(){var w=window;w.__aisubalBip=w.__aisubalBip||null;" +
  "w.addEventListener('beforeinstallprompt',function(e){e.preventDefault();w.__aisubalBip=e;w.dispatchEvent(new Event('aisubal:install'))});" +
  "w.addEventListener('appinstalled',function(){w.__aisubalBip=null;w.__aisubalInstalled=true;try{localStorage.setItem('" + APP_SETUP_KEY + "','done')}catch(_){}w.dispatchEvent(new Event('aisubal:install'))});" +
  "if('serviceWorker' in navigator&&(!/^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname)||/[?&]sw=1/.test(location.search)))" +
  "w.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(function(){})})})();"

/** Running as the installed app (Android/desktop display-mode, or iOS home-screen). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export const INSTALL_EVENT = 'aisubal:install'

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallMode = 'prompt' | 'ios' | null

/** iPhone/iPad Safari (iPadOS reports a Mac UA with touch). Other iOS browsers are excluded. */
export function isIosSafari(ua: string, maxTouchPoints = 0): boolean {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1)
  if (!ios) return false
  return /Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|DuckDuckGo|YaBrowser|Instagram|FBAN|FBAV|KAKAOTALK|NAVER|Line\//.test(ua)
}

/** Which install path to show: none when already installed or unsupported. */
export function installMode(s: { standalone: boolean; installed?: boolean; hasPrompt: boolean; ua: string; maxTouchPoints?: number }): InstallMode {
  if (s.standalone || s.installed) return null
  if (s.hasPrompt) return 'prompt'
  if (isIosSafari(s.ua, s.maxTouchPoints)) return 'ios'
  return null
}
