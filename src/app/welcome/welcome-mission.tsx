'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Globe2 } from 'lucide-react'
import { MISSION_MAX, MISSION_MIN } from '@/lib/onboarding-rules'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/** A54: one question, one answer → the first post. No skip: it's what opens the feed. */
export function WelcomeMission({ name, question, preview }: { name: string; question: string; preview: boolean }) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const n = answer.trim().length
  const ok = n >= MISSION_MIN && n <= MISSION_MAX

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ok || busy) return
    if (preview) {
      toast.message(tn('미리보기라 게시하지 않았어요.'))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/onboarding/mission', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('게시하지 못했어요.'))
      toast.success(tn('첫 글을 올렸어요. 환영해요!'))
      router.replace(data.postId ? `/posts/${data.postId}` : '/feed')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('게시하지 못했어요.'))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="welcome">
      <p className="welcome-kicker"><T s="{name}님, 마지막 한 단계예요" vars={{ name }} /></p>
      <h1 className="welcome-q">{question}</h1>
      <p className="welcome-sub"><T>답이 내 첫 글이 돼요. 짧아도 좋아요 — 올리면 피드가 열려요.</T></p>
      <textarea
        className="welcome-input"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        rows={6}
        maxLength={MISSION_MAX + 50}
        placeholder={tx('예: Cursor로 PR 리뷰 받고, Claude로 회의록 요약해요…')}
        aria-label={question}
        autoFocus
      />
      <div className="welcome-foot">
        <span className="welcome-vis"><Globe2 className="w-3.5 h-3.5" aria-hidden /> <T>전체 회원에게 보여요</T></span>
        <span className={`welcome-count${n > MISSION_MAX ? ' is-over' : ''}`}>{n}/{MISSION_MAX}</span>
      </div>
      <button type="submit" disabled={!ok || busy} className="btn btn-primary w-full min-h-[48px] rounded-full text-[15px]">
        {busy ? <T>올리는 중…</T> : <T>첫 글 올리고 시작하기</T>}
      </button>
      {n > 0 && n < MISSION_MIN && <p className="welcome-hint"><T>10자 이상 적어 주세요.</T></p>}
    </form>
  )
}
