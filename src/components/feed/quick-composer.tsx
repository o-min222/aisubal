'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUp, ImagePlus, Maximize2, MessageCircleQuestion, X } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { Composer, type ComposerIdentity } from '@/components/feed/composer'
import { useLocale, useT, tn, tx } from '@/i18n/client'
import { T } from '@/i18n/t'
import { piiWarning } from '@/lib/pii'
import { postedHref } from '@/lib/posted-rules'
import { uploadPickedImage, type PickedImage } from '@/lib/post-image-client'
import { applyStarter, questionText, quickShouldSubmit, QUICK_PLACEHOLDER, QUICK_STARTERS, type DailyQuestion } from '@/lib/quick-post-rules'

/**
 * A62: the feed-top one-liner. Type a line, Enter posts it (전체 회원 or your usual 공유범위).
 * Starter chips prefill a sentence (no category is forced), 스크린샷 한 장 picks an image,
 * 오늘의 질문 attaches today's question; ⤢ opens the full composer with what's typed.
 */
export function QuickComposer({ me, question }: { me: ComposerIdentity; question: DailyQuestion | null }) {
  const router = useRouter()
  const tr = useT()
  const locale = useLocale()
  const [body, setBody] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [image, setImage] = useState<PickedImage | null>(null)
  const [answering, setAnswering] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const pii = useMemo(() => piiWarning(body), [body])
  const starters = useMemo(() => QUICK_STARTERS.filter((s) => s.prefill).map((s) => tr(s.prefill!)), [tr])
  const qText = question ? questionText(question, locale) : ''
  const attachedQ = answering && question ? question : null

  function starter(id: string) {
    const s = QUICK_STARTERS.find((x) => x.id === id)
    if (!s) return
    if (!s.prefill) { file.current?.click(); return }
    setBody((b) => applyStarter(b, tr(s.prefill!), starters))
    requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
  }

  async function pick(f: File | undefined) {
    if (!f) return
    setUploading(true)
    try {
      setImage(await uploadPickedImage(f, (s) => tr(s)))
      setExpanded(true) // an image goes with the full composer (preview, 공유범위)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('업로드하지 못했어요.'))
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ''
    }
  }

  async function submit() {
    if (!body.trim() || busy) return
    if (pii && piiAckFor !== body) {
      setPiiAckFor(body)
      toast.warning(tx('{pii} 공개 글이에요. 그래도 올리려면 한 번 더 눌러주세요.', { pii }))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body,
          postedAs: 'real',
          agentInteraction: me.agentInteraction ?? 'humans_only',
          visibility: me.visibility ?? 'members',
          ...(attachedQ ? { dailyQuestionId: attachedQ.id } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('게시하지 못했어요.'))
      setBody('')
      setAnswering(false)
      toast.success(tn('게시했어요'))
      router.push(postedHref('/feed', data.id))
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('게시하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  if (expanded) {
    return (
      <div className="qc qc-open">
        <Composer
          me={me}
          initialBody={body}
          initialImage={image}
          question={attachedQ}
          onClearQuestion={() => setAnswering(false)}
          autoFocus
          className="qc-full"
          onPosted={() => { setExpanded(false); setBody(''); setImage(null); setAnswering(false) }}
        />
        <button type="button" className="qc-fold" onClick={() => { setExpanded(false); setImage(null) }}><T>접기</T></button>
      </div>
    )
  }

  return (
    <section className="qc" aria-label={tx('빠른 글쓰기')}>
      <div className="qc-row">
        <UserAvatar id={me.id} name={me.displayName} avatarUrl={me.avatarUrl} size="sm" />
        <div className="qc-field">
          {attachedQ && (
            <button type="button" className="qc-qtag" onClick={() => setAnswering(false)} aria-label={tx('오늘의 질문 빼기')}>
              <MessageCircleQuestion className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{qText}</span><X className="w-3 h-3 flex-shrink-0" />
            </button>
          )}
          <input
            ref={input}
            className="qc-input"
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (quickShouldSubmit({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, body)) { e.preventDefault(); void submit() }
              else if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); setBody((b) => b + '\n'); setExpanded(true) }
            }}
            placeholder={attachedQ ? tr('한 줄로 답해 보세요') : tr(QUICK_PLACEHOLDER)}
            aria-label={tx('게시물 내용')}
            enterKeyHint="send"
          />
        </div>
        <button type="button" className="qc-icon" onClick={() => setExpanded(true)} aria-label={tx('크게 쓰기')} title={tx('크게 쓰기')}>
          <Maximize2 className="w-4 h-4" />
        </button>
        {body.trim() && (
          <button type="button" className="qc-send" onClick={() => void submit()} disabled={busy} aria-label={tx('게시')}>
            <ArrowUp className="w-4 h-4" />
          </button>
        )}
      </div>
      {pii && <p role="alert" className="qc-pii"><T s="{pii} 멤버 모두가 볼 수 있어요. 지우거나 가려주세요." vars={{ pii }} /></p>}
      <div className="qc-chips chip-row">
        {QUICK_STARTERS.map((s) => (
          <button key={s.id} type="button" className="qc-chip" onClick={() => starter(s.id)} disabled={s.id === 'shot' && uploading}>
            {s.id === 'shot' && <ImagePlus className="w-3.5 h-3.5" />}
            {s.id === 'shot' && uploading ? <T>올리는 중…</T> : <T>{s.label}</T>}
          </button>
        ))}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      {question && (
        <div className="qc-daily">
          <span className="qc-daily-label"><T>오늘의 질문</T></span>
          <span className="qc-daily-q">{qText}</span>
          {question.answered ? (
            <span className="qc-daily-meta"><T s="답했어요 · {n}명" vars={{ n: question.answers }} /></span>
          ) : !answering ? (
            <button type="button" className="qc-chip" onClick={() => { setAnswering(true); requestAnimationFrame(() => input.current?.focus()) }}><T>답하기</T></button>
          ) : null}
        </div>
      )}
    </section>
  )
}
