'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowUp, ImagePlus, Maximize2 } from 'lucide-react'
import { UserAvatar } from '@/components/user-avatar'
import { Composer, type ComposerIdentity } from '@/components/feed/composer'
import { useT, tn, tx } from '@/i18n/client'
import { T } from '@/i18n/t'
import { postedHref } from '@/lib/posted-rules'
import { ComposerTextarea } from '@/components/composer/composer-frame'
import { useComposer, useImageAttach } from '@/components/composer/use-composer'
import { applyStarter, QUICK_PLACEHOLDER, QUICK_STARTERS } from '@/lib/quick-post-rules'
import { fetchJson } from '@/lib/fetch-json'

/**
 * A62: the feed-top composer. Starter chips prefill a sentence (no category is forced),
 * 스크린샷 한 장 picks an image, ⤢ opens the full composer with what's typed.
 * A102: Enter is a newline (the field grows); posting is the button, or Cmd/Ctrl+Enter on a keyboard.
 */
export function QuickComposer({ me }: { me: ComposerIdentity }) {
  const router = useRouter()
  const tr = useT()
  const [expanded, setExpanded] = useState(false)
  // an image goes with the full composer (preview, 공유범위)
  const attach = useImageAttach(null, () => setExpanded(true))
  const { image, setImage, uploading } = attach
  // A97: the 질문해요 chip is a switch: the post is saved as a question (a 질문 tag before the text), no sentence is typed for you
  const [question, setQuestion] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const { body, setBody, busy, pii, submit } = useComposer({
    piiNotice: (pii) => tx('{pii} 공개 글이에요. 그래도 올리려면 한 번 더 눌러주세요.', { pii }),
    errorFallback: () => tn('게시하지 못했어요.'),
    send: async (text) => {
      const { ok, data } = await fetchJson<{ id: string }>('/api/feed', {
        method: 'POST',
        json: {
          body: text,
          postedAs: 'real',
          agentInteraction: me.agentInteraction ?? 'agents_allowed',
          visibility: me.visibility ?? 'members',
          ...(question ? { isQuestion: true } : {}),
        },
      })
      if (!ok) throw new Error(data.error || tn('게시하지 못했어요.'))
      setBody('')
      setQuestion(false)
      toast.success(tn('게시했어요'))
      router.push(postedHref('/feed', data.id))
      router.refresh()
    },
  })
  const starters = useMemo(() => QUICK_STARTERS.filter((s) => s.prefill).map((s) => tr(s.prefill!)), [tr])

  function starter(id: string) {
    const s = QUICK_STARTERS.find((x) => x.id === id)
    if (!s) return
    if (s.id === 'ask') { setQuestion((q) => !q); requestAnimationFrame(() => input.current?.focus()); return }
    if (!s.prefill) { attach.open(); return }
    setBody(applyStarter(body, tr(s.prefill!), starters))
    requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
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
          <ComposerTextarea
            ref={input}
            bare
            autosize={160}
            className="qc-input"
            value={body}
            rows={1}
            onChange={(e) => setBody(e.target.value)}
            onSubmitShortcut={() => void submit()}
            placeholder={tr(QUICK_PLACEHOLDER)}
            aria-label={tx('게시물 내용')}
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
        {attach.input}
      </div>
    </section>
  )
}
