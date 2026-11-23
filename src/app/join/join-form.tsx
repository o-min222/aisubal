'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { JOIN_REASON_MAX, joinEmailError } from '@/lib/join-rules'
import { T } from '@/i18n/t'
import { tx } from '@/i18n/client'

/** A57: the sign-up form and the live '현재 대기자 N명' line (refreshed every 30s). */
export function JoinForm({ initialWaiting, source }: { initialWaiting: number | null; source: string | null }) {
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [website, setWebsite] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [waiting, setWaiting] = useState(initialWaiting)

  useEffect(() => {
    const tick = async () => {
      if (document.hidden) return
      const d = await fetch('/api/join', { cache: 'no-store' }).then((r) => r.json()).catch(() => null)
      if (typeof d?.waiting === 'number') setWaiting(d.waiting)
    }
    const id = window.setInterval(tick, 30_000)
    return () => window.clearInterval(id)
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const bad = joinEmailError(email)
    if (bad) return setError(tx(bad))
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/join', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, reason: reason.trim() || null, source, website }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || tx('처리에 실패했어요.'))
      if (typeof d.waiting === 'number') setWaiting(d.waiting)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('처리에 실패했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const count = waiting !== null && waiting > 0 ? (
    <p className="join-count" aria-live="polite"><span className="join-dot" aria-hidden /> {tx('현재 대기자 {n}명', { n: waiting.toLocaleString() })}</p>
  ) : null

  if (done) {
    return (
      <div className="join-done" role="status">
        <CheckCircle2 className="w-6 h-6" />
        <p className="join-done-title"><T>대기 명단에 올렸어요</T></p>
        <p className="join-sub"><T>초대 코드가 생기면 이 이메일로 알려 드릴게요. 같은 이메일로 다시 신청할 필요는 없어요.</T></p>
        {count}
      </div>
    )
  }

  return (
    <form className="join-form" onSubmit={submit} noValidate>
      {count}
      <label className="join-label" htmlFor="join-email"><T>이메일</T></label>
      <input id="join-email" type="email" inputMode="email" autoComplete="email" className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" maxLength={254} required />
      <label className="join-label" htmlFor="join-reason"><T>왜 들어오고 싶은지 한 줄 (선택)</T></label>
      <textarea id="join-reason" className="input w-full" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={JOIN_REASON_MAX} placeholder={tx('예: Claude Code로 사이드 프로젝트를 만들고 있어요')} />
      <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} className="join-hp" tabIndex={-1} autoComplete="off" aria-hidden />
      {error && <p className="join-error" role="alert">{error}</p>}
      <button type="submit" disabled={busy || !email.trim()} className="btn btn-primary teaser-cta-btn">{busy ? <T>보내는 중…</T> : <T>대기 명단에 이름 올리기</T>}</button>
      <p className="join-fine"><T>이메일은 초대 연락에만 써요.</T></p>
    </form>
  )
}
