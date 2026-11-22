'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

export default function WaitlistPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // code saved by the /i/{code} invite link (httpOnly cookie → /api/invites/pending)
  const [fromLink, setFromLink] = useState<{ code: string; valid: boolean; message: string; inviter: string | null } | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/invites/pending')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d?.code) return
        setFromLink({ code: d.code, valid: Boolean(d.valid), message: d.message, inviter: d.inviter?.displayName ?? null })
        if (d.valid) setInviteCode(d.code)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/redeem-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: inviteCode.trim().toUpperCase() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || tx('초대 코드가 유효하지 않습니다.'))
        return
      }

      // Signup complete — pick a nickname, @handle and avatar before entering.
      router.push(data.needsProfile === false ? '/feed' : '/onboarding')
      router.refresh()
    } catch {
      setError(tx('네트워크 오류가 발생했습니다.'))
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-n-f7f7f7 flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8">
        <Image
          src="/images/logo-black.png"
          alt={tx('AI쓰발')}
          width={160}
          height={48}
          priority
          className="logo-ink h-10 w-auto"
        />
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-n-fff border border-n-e5e5e5 rounded-xl p-8">
        <h1 className="text-xl font-bold text-n-111 text-center mb-2">
          <T>웨이트리스트에 등록되었습니다</T>
        </h1>
        <p className="text-sm text-n-666 text-center mb-6">
          <T>AI쓰발은 초대 전용 커뮤니티입니다.</T>
          <br />
          <T>초대 코드를 입력하면 가입이 완료됩니다.</T>
        </p>

        {fromLink && (
          <div
            role="status"
            className={`mb-4 p-3 rounded-lg text-sm text-center ${fromLink.valid ? 'bg-c-e8f5ee border border-green-200 text-c-166534' : 'bg-c-fff4e5 border border-amber-200 text-c-8a4b00'}`}
          >
            {fromLink.valid ? (
              <><T s="{v}님의 초대 링크로 왔어요. 코드가 확인됐어요 — 아래 버튼을 눌러 가입을 마치세요." vars={{ v: fromLink.inviter ? <b>{fromLink.inviter}</b> : <T>멤버</T> }} /></>
            ) : (
              <>
                <T>초대 링크의 코드</T> <span className="font-mono">{fromLink.code}</span>: {fromLink.message} 웨이트리스트에 등록돼 있으니, 다른 코드를 받으면 아래에 입력하세요.
              </>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 p-3 bg-c-fdecec border border-red-200 rounded-lg text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-n-333 mb-2">
              <T>초대 코드</T>
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder={tx('8자리 코드 입력')}
              className="input font-mono text-center tracking-widest uppercase"
              maxLength={8}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || inviteCode.length < 8}
            className="btn btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-n-fff"></span>
                <T>확인 중...</T>
              </span>
            ) : (
              tx('가입 완료하기')
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-n-eee">
          <p className="text-xs text-n-888 text-center mb-3">
            <T>초대 코드가 없으신가요?</T>
            <br />
            <T>기존 멤버에게 초대를 요청해보세요.</T>
          </p>
          <button
            onClick={handleLogout}
            className="btn btn-ghost w-full text-sm"
          >
            <T>로그아웃</T>
          </button>
        </div>
      </div>
    </div>
  )
}
