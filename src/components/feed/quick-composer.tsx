'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUp, ImagePlus, Maximize2 } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { Composer, type ComposerIdentity } from '@/components/feed/composer'
import { useT, tn, tx } from '@/i18n/client'
import { T } from '@/i18n/t'
import { piiWarning } from '@/lib/pii'
import { postedHref } from '@/lib/posted-rules'
import { uploadPickedImage, type PickedImage } from '@/lib/post-image-client'
import { COMPOSER_ENTER_KEY_HINT, composerKeySubmits, isCoarsePointer } from '@/lib/composer-keys'
import { applyStarter, QUICK_PLACEHOLDER, QUICK_STARTERS } from '@/lib/quick-post-rules'

/**
 * A62: the feed-top composer. Starter chips prefill a sentence (no category is forced),
 * 스크린샷 한 장 picks an image, ⤢ opens the full composer with what's typed.
 * A102: Enter is a newline (the field grows); posting is the button, or Cmd/Ctrl+Enter on a keyboard.
 */
export function QuickComposer({ me }: { me: ComposerIdentity }) {
  const router = useRouter()
  const tr = useT()
  const [body, setBody] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [image, setImage] = useState<PickedImage | null>(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  // A97: the 질문해요 chip is a switch: the post is saved as a question (a 질문 tag before the text), no sentence is typed for you
  const [question, setQuestion] = useState(false)
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const pii = useMemo(() => piiWarning(body), [body])
  const starters = useMemo(() => QUICK_STARTERS.filter((s) => s.prefill).map((s) => tr(s.prefill!)), [tr])

  function grow(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }
  useEffect(() => { if (input.current) grow(input.current) }, [body])

  function starter(id: string) {
    const s = QUICK_STARTERS.find((x) => x.id === id)
    if (!s) return
    if (s.id === 'ask') { setQuestion((q) => !q); requestAnimationFrame(() => input.current?.focus()); return }
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
          agentInteraction: me.agentInteraction ?? 'agents_allowed',
          visibility: me.visibility ?? 'members',
          ...(question ? { isQuestion: true } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('게시하지 못했어요.'))
      setBody('')
      setQuestion(false)
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
          initialQuestion={question}
          initialImage={image}
          autoFocus
          className="qc-full"
          onPosted={() => { setExpanded(false); setBody(''); setImage(null); setQuestion(false) }}
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
          {question && <span className="q-tag"><T>질문</T></span>}
          <textarea
            ref={input}
            className="qc-input"
            value={body}
            rows={1}
            maxLength={2000}
            onChange={(e) => { setBody(e.target.value); grow(e.currentTarget) }}
            onKeyDown={(e) => {
              if (!composerKeySubmits(e, isCoarsePointer())) return
              e.preventDefault()
              void submit()
            }}
            placeholder={tr(QUICK_PLACEHOLDER)}
            aria-label={tx('게시물 내용')}
            enterKeyHint={COMPOSER_ENTER_KEY_HINT}
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
          <button key={s.id} type="button" className="qc-chip" onClick={() => starter(s.id)} disabled={s.id === 'shot' && uploading} aria-pressed={s.id === 'ask' ? question : undefined}>
            {s.id === 'shot' && <ImagePlus className="w-3.5 h-3.5" />}
            {s.id === 'shot' && uploading ? <T>올리는 중…</T> : <T>{s.label}</T>}
          </button>
        ))}
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
    </section>
  )
}
