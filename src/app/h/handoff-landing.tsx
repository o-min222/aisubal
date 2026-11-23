'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, ShieldAlert, Smartphone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AFTER_LOGIN_COOKIE, HANDOFF_PATH, HANDOFF_STORAGE_KEY, isHandoffToken, tokenFromFragment } from '@/lib/handoff-rules'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

type State = 'working' | 'needs_login' | 'wrong_member' | 'invalid'

export function HandoffLanding() {
  const router = useRouter()
  const [state, setState] = useState<State>('working')
  useEffect(() => {
    // take the token out of the address bar (and history) right away; keep it only for this tab
    const fromHash = tokenFromFragment(window.location.hash)
    if (fromHash) {
      sessionStorage.setItem(HANDOFF_STORAGE_KEY, fromHash)
      history.replaceState(null, '', HANDOFF_PATH)
    }
    const token = sessionStorage.getItem(HANDOFF_STORAGE_KEY)
    if (!isHandoffToken(token)) return setState('invalid') // eslint-disable-line react-hooks/set-state-in-effect
    void (async () => {
      const r = await fetch('/api/handoff/redeem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }).catch(() => null)
      const result = r?.ok ? ((await r.json()) as { result: State | 'ok' }).result : 'invalid'
      if (result !== 'needs_login') sessionStorage.removeItem(HANDOFF_STORAGE_KEY)
      if (result === 'ok') {
        router.replace('/onboarding/app?from=handoff')
        router.refresh()
      } else setState(result)
    })()
  }, [router])

  async function signIn() {
    // come back here after Google; the token stays in this tab's sessionStorage, never in a URL or cookie
    document.cookie = `${AFTER_LOGIN_COOKIE}=${encodeURIComponent(HANDOFF_PATH)}; path=/; max-age=600; samesite=lax; secure`
    await createClient().auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
  }

  return (
    <main className="min-h-dvh grid place-items-center px-5" style={{ background: 'var(--n-f4f2ee)' }}>
      <div className="card w-full max-w-[420px] p-6 text-center space-y-3">
        {state === 'working' ? (
          <>
            <Loader2 className="w-6 h-6 mx-auto animate-spin text-n-888" aria-hidden />
            <p className="text-[15px] font-semibold text-n-111" role="status"><T>폰에서 여는 중…</T></p>
          </>
        ) : state === 'needs_login' ? (
          <>
            <Smartphone className="w-6 h-6 mx-auto text-n-555" aria-hidden />
            <h1 className="text-[18px] font-bold text-n-111"><T>PC와 같은 계정으로 로그인해요</T></h1>
            <p className="text-[13.5px] text-n-666" style={{ wordBreak: 'keep-all' }}><T>로그인하면 바로 홈 화면에 추가하는 단계로 이어져요.</T></p>
            <button type="button" className="btn btn-primary w-full min-h-[48px]" onClick={signIn}><T>Google로 계속하기</T></button>
          </>
        ) : (
          <>
            <ShieldAlert className="w-6 h-6 mx-auto text-n-555" aria-hidden />
            <h1 className="text-[18px] font-bold text-n-111">
              {state === 'wrong_member' ? tx('다른 계정으로 로그인돼 있어요') : tx('링크가 만료됐거나 이미 쓰였어요')}
            </h1>
            <p className="text-[13.5px] text-n-666" style={{ wordBreak: 'keep-all' }}>
              {state === 'wrong_member' ? tx('QR을 만든 계정으로 로그인한 뒤 다시 열어 주세요.') : tx('PC에서 새 QR을 만들어 다시 찍어 주세요. 링크는 10분 동안 한 번만 쓸 수 있어요.')}
            </p>
          </>
        )}
      </div>
    </main>
  )
}
