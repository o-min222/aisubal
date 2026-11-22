'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/i18n/client'

/** Saves the code (httpOnly cookie via /api/invites/claim), then Google login or straight to signup. */
export function InviteLandingActions({ code, usable, signedIn }: { code: string | null; usable: boolean; signedIn: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const t = useT()

  useEffect(() => {
    if (code && usable) fetch('/api/invites/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => {})
  }, [code, usable])

  async function go() {
    setBusy(true)
    if (code && usable) {
      await fetch('/api/invites/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }).catch(() => {})
    }
    if (signedIn) {
      router.push('/waitlist')
      return
    }
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={go} disabled={busy} className="w-full flex items-center justify-center gap-3 px-6 min-h-[48px] bg-[#111] hover:bg-[#222] text-white font-medium rounded-xl disabled:opacity-60">
        {signedIn ? (
          t('이 코드로 가입 완료하기')
        ) : (
          <>
            <span className="w-6 h-6 rounded-full bg-white inline-flex items-center justify-center" aria-hidden>
              <GoogleIcon />
            </span>
            {usable ? t('Google로 가입하기') : t('Google로 로그인 (웨이트리스트)')}
          </>
        )}
      </button>
      {!usable && <p className="text-xs text-[#888]">{t('로그인하면 웨이트리스트에 등록돼요. 다른 초대 코드를 받으면 그때 입력할 수 있어요.')}</p>}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853" />
      <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
    </svg>
  )
}
