'use client'

import { useMemo, useState } from 'react'
import { publishReplyDelta } from '@/lib/count-store'
import { piiWarning } from '@/lib/pii'
import { useRouter } from 'next/navigation'
import { VenetianMask, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ANON_CATEGORIES, ANON_NOTICE, type AnonCategory } from '@/lib/anon-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { ChipBar } from '@/components/chip-bar'
import { ComposerFrame, ComposerTextarea } from '@/components/composer/composer-frame'
import { AuthorshipPicker } from '@/components/composer/authorship-picker'
import type { Authorship } from '@/lib/authorship'

/** 익명 composer. Root posts pick a category; replies inherit the thread's. */
export function AnonComposer({
  parentId,
  countIds,
  replyKind = 'reply',
  defaultCategory,
  autoFocus,
  redirectTo,
  className = '',
}: {
  parentId?: string
  /** replies: posts whose comment counts go up (root + the comment answered) */
  countIds?: string[]
  /** 'comment' answers the post (댓글), 'reply' answers a comment (대댓글) */
  replyKind?: 'comment' | 'reply'
  defaultCategory?: AnonCategory | null
  autoFocus?: boolean
  /** after posting a root: 'thread' opens the new thread */
  redirectTo?: 'thread'
  className?: string
}) {
  const router = useRouter()
  const isReply = Boolean(parentId)
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<AnonCategory | null>(defaultCategory ?? null)
  const [authorship, setAuthorship] = useState<Authorship>('human')
  const [busy, setBusy] = useState(false)
  const canSubmit = body.trim().length > 0 && !busy && (isReply || category)

  const pii = useMemo(() => piiWarning(body), [body])
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)

  async function submit() {
    if (!canSubmit) {
      if (!isReply && !category && body.trim()) toast.error(tn('카테고리를 골라주세요.'))
      return
    }
    if (pii && piiAckFor !== body) {
      setPiiAckFor(body)
      toast.warning(tx('{pii} 익명이어도 신원이 드러날 수 있어요. 그래도 올리려면 한 번 더 눌러주세요.', { pii }))
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/anon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, category, parentId, authorship }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '게시하지 못했어요.')
      setBody('')
      setAuthorship('human')
      toast.success(isReply ? tx('{alias}(으)로 답글을 남겼어요', { alias: data.alias }) : tx('{alias}(으)로 게시했어요', { alias: data.alias }))
      if (isReply && countIds?.length) publishReplyDelta(countIds, 1)
      if (redirectTo === 'thread' && !isReply) router.push(`/anon/${data.id}`)
      else router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('게시하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ComposerFrame
      className={className}
      avatar={
        <span className="w-10 h-10 rounded-full bg-n-222 text-n-fff flex items-center justify-center" aria-hidden="true">
          <VenetianMask className="w-5 h-5" />
        </span>
      }
      head={<span className="font-semibold text-n-111"><T>익명</T></span>}
      tools={
        <span className="composer-tools">
          <span className="composer-note" title={tx(ANON_NOTICE)}>
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate"><T>{ANON_NOTICE}</T></span>
          </span>
          <AuthorshipPicker value={authorship} onChange={setAuthorship} />
        </span>
      }
      onSubmit={submit}
      canSubmit={Boolean(body.trim())}
      busy={busy}
      submitLabel={busy ? <T>게시 중…</T> : isReply ? (replyKind === 'comment' ? <T>댓글</T> : <T>답글</T>) : <T>게시</T>}
    >
      {!isReply && (
        <ChipBar as="div" role="radiogroup" label={tx('카테고리')} className="mt-1">
          {ANON_CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={category === c.id}
              onClick={() => setCategory(c.id)}
              className={`filter-chip is-sm ${category === c.id ? 'on' : ''}`}
            >
              <T>{c.label}</T>
            </button>
          ))}
        </ChipBar>
      )}
      <ComposerTextarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onSubmitShortcut={submit}
        placeholder={isReply ? (replyKind === 'comment' ? tx('익명으로 댓글 남기기…') : tx('익명으로 답글 남기기…')) : tx('회사 얘기, 커리어 고민, AI 때문에 생긴 일… 편하게 털어놓으세요.')}
        autoFocus={autoFocus}
        rows={isReply ? 2 : 3}
        aria-label={isReply ? tx('익명 답글 내용') : tx('익명 게시물 내용')}
      />
      {pii && (
        <p role="alert" className="pii-warning flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs mb-1" style={{ background: 'var(--c-fff4e5)', color: 'var(--c-8a4b00)' }}>
          <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
          <span><T s="{pii} 익명 글이어도 신원이 드러날 수 있어요. 지우거나 가려주세요." vars={{ pii }} /></span>
        </p>
      )}
    </ComposerFrame>
  )
}
