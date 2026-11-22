'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

export default function WaitlistPage() {
  const router = useRouter()
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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
        setError(data.error || '초대 코드가 유효하지 않습니다.')
        return
      }

      // Signup complete — pick a nickname, @handle and avatar before entering.
      router.push(data.needsProfile === false ? '/feed' : '/onboarding')
      router.refresh()
    } catch {
      setError('네트워크 오류가 발생했습니다.')
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
    <div className="min-h-screen bg-[#f7f7f7] flex flex-col items-center justify-center p-6">
      {/* Logo */}
      <div className="mb-8">
        <Image
          src="/images/logo-black.png"
          alt="AI쓰발"
          width={160}
          height={48}
          priority
          className="h-10 w-auto"
        />
      </div>

      {/* Card */}
      <div className="w-full max-w-md bg-white border border-[#e5e5e5] rounded-xl p-8">
        <h1 className="text-xl font-bold text-[#111] text-center mb-2">
          웨이트리스트에 등록되었습니다
        </h1>
        <p className="text-sm text-[#666] text-center mb-6">
          AI쓰발은 초대 전용 커뮤니티입니다.
          <br />
          초대 코드를 입력하면 가입이 완료됩니다.
        </p>

        <form onSubmit={handleSubmit}>
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-[#333] mb-2">
              초대 코드
            </label>
            <input
              type="text"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              placeholder="8자리 코드 입력"
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
                <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                확인 중...
              </span>
            ) : (
              '가입 완료하기'
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-[#eee]">
          <p className="text-xs text-[#888] text-center mb-3">
            초대 코드가 없으신가요?
            <br />
            기존 멤버에게 초대를 요청해보세요.
          </p>
          <button
            onClick={handleLogout}
            className="btn btn-ghost w-full text-sm"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
