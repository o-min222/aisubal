'use client'

import { useCallback, useEffect, useState } from 'react'
import { INSTALL_EVENT, installMode, isStandalone, type BeforeInstallPromptEvent, type InstallMode } from '@/lib/pwa-install'

type W = Window & { __aisubalBip?: BeforeInstallPromptEvent | null; __aisubalInstalled?: boolean }

function read(): InstallMode {
  const w = window as W
  return installMode({ standalone: isStandalone(), installed: w.__aisubalInstalled, hasPrompt: !!w.__aisubalBip, ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints })
}

/** null until mounted (SSR) and whenever install isn't possible. */
export function usePwaInstall() {
  const [mode, setMode] = useState<InstallMode>(null)
  useEffect(() => {
    const sync = () => setMode(read())
    sync()
    // A89: installed from another tab / the browser menu — Chrome reports it via related_applications
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
    nav.getInstalledRelatedApps?.()
      .then((apps) => {
        if (apps.length > 0) {
          ;(window as W).__aisubalInstalled = true
          sync()
        }
      })
      .catch(() => {})
    window.addEventListener(INSTALL_EVENT, sync)
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', sync)
    return () => {
      window.removeEventListener(INSTALL_EVENT, sync)
      mq?.removeEventListener?.('change', sync)
    }
  }, [])
  /** Chromium: one tap → the browser's install dialog. The event is single-use. */
  const prompt = useCallback(async () => {
    const w = window as W
    const e = w.__aisubalBip
    if (!e) return null
    w.__aisubalBip = null
    await e.prompt()
    const { outcome } = await e.userChoice.catch(() => ({ outcome: 'dismissed' as const }))
    if (outcome === 'accepted') w.__aisubalInstalled = true
    setMode(read())
    return outcome
  }, [])
  return { mode, prompt }
}
