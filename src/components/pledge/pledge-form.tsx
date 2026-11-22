'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { PLEDGE_KO, pledgeTextFor, signatureMatches } from '@/lib/pledge'
import { useLocale, useT, tn } from '@/i18n/client'
import { PledgeDocument, PledgeSeal } from './pledge-document'

/** Type your own nickname as the signature, then '서약하고 입단하기'. */
export function PledgeForm({ signer, inviter, next, kicker, intro }: { signer: string; inviter: string | null; next: string; kicker?: string; intro?: string }) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [sealed, setSealed] = useState(false)
  const ok = signatureMatches(typed, signer)
  const t = useT()
  const locale = useLocale()
  const doc = pledgeTextFor(locale)

  async function sign() {
    if (!ok || busy) return
    setBusy(true)
    try {
      const res = await fetch('/api/pledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature: typed }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error ? t(d.error) : t('서약을 저장하지 못했어요.'))
      setSealed(true)
      toast.success(t(tn('{name}님, AI쓰발에 입단했어요'), { name: signer }))
      setTimeout(() => {
        router.replace(next)
        router.refresh()
      }, 1300)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t(tn('서약을 저장하지 못했어요.')))
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        sign()
      }}
      className="space-y-5"
    >
      <PledgeDocument
        t={doc}
        kicker={kicker ? <>{kicker}{intro ? <span className="block mt-1 font-normal tracking-normal text-[13.5px] text-[#666]">{intro}</span> : null}</> : undefined}
        inviter={inviter}
        foundingLabel={t('창립 멤버')}
        seal={sealed ? <PledgeSeal animate label={t('입단')} /> : null}
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
            aria-label={t('서명: 내 닉네임 ‘{name}’을 입력', { name: signer })}
            aria-describedby="pledge-sign-hint"
            className={`pledge-signature ${ok ? 'is-ok' : ''}`}
          />
        }
      />
      <p id="pledge-sign-hint" className="text-[13px] leading-relaxed" style={{ color: ok ? '#0a7a3d' : '#8a8a8a', wordBreak: 'keep-all' }}>
        {ok ? t('서명이 확인됐어요.') : t('서약자 칸에 내 닉네임 ‘{name}’을 그대로 적으면 서명돼요. 실명은 쓰지 않아요.', { name: signer })}
      </p>
      <button type="submit" disabled={!ok || busy} className="pledge-cta">
        {sealed ? t('입단을 환영해요') : busy ? t('서약하는 중…') : t('서약하고 입단하기')}
      </button>
      {doc !== PLEDGE_KO && <PledgeOriginal />}
    </form>
  )
}

/** In translated UIs, the authored Korean original stays one tap away. */
export function PledgeOriginal() {
  const t = useT()
  return (
    <details className="pledge-original">
      <summary>{t('한국어 원문 보기 (원문이 기준이에요)')}</summary>
      <div lang="ko">
        {[...PLEDGE_KO.preamble, ...PLEDGE_KO.vows, PLEDGE_KO.closing, PLEDGE_KO.dateline].map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
    </details>
  )
}
