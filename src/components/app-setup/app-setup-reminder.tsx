'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ChevronRight, Smartphone } from 'lucide-react'
import { APP_SETUP_KEY, isStandalone } from '@/lib/pwa-install'
import { T } from '@/i18n/t'

/** After 나중에 in onboarding: a quiet nudge in 설정 until the app is set up (D1). */
export function AppSetupReminder() {
  const [show, setShow] = useState(false)
  useEffect(() => {
    let later = false
    try { later = localStorage.getItem(APP_SETUP_KEY) === 'later' } catch {}
    setShow(later && !isStandalone()) // eslint-disable-line react-hooks/set-state-in-effect
  }, [])
  if (!show) return null
  return (
    <Link href="/settings/app" className="card app-setup-remind">
      <Smartphone className="w-4 h-4 flex-shrink-0" aria-hidden />
      <span className="min-w-0 flex-1"><T>모바일 앱 설정이 남았어요 · 홈 화면에 추가하기</T></span>
      <ChevronRight className="w-4 h-4 flex-shrink-0 text-n-888" aria-hidden />
    </Link>
  )
}
