'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PLEDGE_KO, signatureMatches } from '@/lib/pledge'
import { PledgeDocument, PledgeSeal } from './pledge-document'

/** Type your own nickname as the signature, then '서약하고 입단하기'. */
export function PledgeForm({ signer, inviter, next }: { signer: string; inviter: string | null; next: string }) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [sealed, setSealed] = useState(false)
  const ok = signatureMatches(typed, signer)

  async function sign() {
    if (!ok || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/pledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: typed }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || '서약을 저장하지 못했어요.')
      setSealed(true)
      toast.success(`${signer}님, AI쓰발에 입단했어요`)
      setTimeout(() => {
        router.replace(next)
        router.refresh()
      }, 1300)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '서약을 저장하지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        sign()
      }}
      className="space-y-4"
    >
      <PledgeDocument
        t={PLEDGE_KO}
        inviter={inviter}
        seal={sealed ? <PledgeSeal animate /> : null}
        signature={
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            maxLength={80}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={busy}
            placeholder={signer}
            aria-label={`서명: 내 닉네임 ‘${signer}’을 입력`}
            aria-describedby="pledge-sign-hint"
            className={`pledge-signature ${ok ? 'is-ok' : ''}`}
          />
        }
      />
      <p id="pledge-sign-hint" className="text-center text-[12.5px]" style={{ color: ok ? '#0a7a3d' : '#888' }}>
        {ok ? '서명이 확인됐어요.' : `서약자 칸에 내 닉네임 ‘${signer}’을 그대로 적으면 서명돼요. 실명은 쓰지 않아요.`}
      </p>
      <button type="submit" disabled={!ok || busy} className="pledge-cta">
        {sealed ? '입단을 환영해요' : busy ? '서약하는 중…' : '서약하고 입단하기'}
      </button>
    </form>
  )
}
