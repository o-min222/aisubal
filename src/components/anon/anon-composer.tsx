'use client'

import { scrollToPosted } from '@/lib/scroll-to-post'
import { useMemo, useState } from 'react'
import { publishReplyDelta } from '@/lib/count-store'
import { piiWarning } from '@/lib/pii'
import { useRouter } from 'next/navigation'
import { VenetianMask, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { postedHref } from '@/lib/posted-rules'
import { offerPushAfterPosting } from '@/lib/push-client'
import { ANON_NOTICE, type AnonCategory } from '@/lib/anon-rules'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'
import { AnonTopicPicker } from './anon-topic-picker'
import { ComposerFrame, ComposerTextarea } from '@/components/composer/composer-frame'

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
  /** after posting a root: 'timeline' opens /anon scrolled to the new post (A23) */
  redirectTo?: 'timeline'
  className?: string
}) {
  const router = useRouter()
  const isReply = Boolean(parentId)
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<AnonCategory | null>(defaultCategory ?? null)
  const [busy, setBusy] = useState(false)
  const canSubmit = body.trim().length > 0 && !busy && (isReply || category)

  const pii = useMemo(() => piiWarning(body), [body])
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)

  async function submit() {
    if (!canSubmit) {
      if (!isReply && !category && body.trim()) toast.error(tn('주제를 골라주세요.'))
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
        body: JSON.stringify({ body, category, parentId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tx('게시하지 못했어요.'))
      setBody('')
      toast.success(isReply ? tx('{alias}(으)로 답글을 남겼어요', { alias: data.alias }) : tx('{alias}(으)로 게시했어요', { alias: data.alias }))
      if (isReply && countIds?.length) publishReplyDelta(countIds, 1)
      offerPushAfterPosting(
        { ask: tn('답글이 달리면 바로 알려드릴까요?'), action: tn('알림 켜기'), on: tn('이 기기에서 알림을 받아요'), failed: tn('알림을 켜지 못했어요. 설정 → 알림에서 다시 켤 수 있어요.') },
        toast,
      )
      if (redirectTo === 'timeline' && !isReply && data.id) router.push(postedHref('/anon', data.id))
      else router.refresh()
      if (isReply) scrollToPosted(data.id)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('게시하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <ComposerFrame
      className={className}
      compact={isReply}
      avatar={
        <span className="w-10 h-10 rounded-full bg-n-222 text-n-fff flex items-center justify-center" aria-hidden="true">
          <VenetianMask className="w-5 h-5" />
        </span>
      }
      head={<span className="font-semibold text-n-111"><T>익명</T></span>}
      tools={
        <span className="composer-tools">
          {!isReply && <AnonTopicPicker value={category} onChange={setCategory} />}
          <span className="composer-note" title={tx(ANON_NOTICE)}>
            <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate"><T>{ANON_NOTICE}</T></span>
          </span>
        </span>
      }
      onSubmit={submit}
      canSubmit={Boolean(body.trim())}
      busy={busy}
      submitLabel={busy ? <T>게시 중…</T> : <T>게시</T>}
    >
      <ComposerTextarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onSubmitShortcut={submit}
        placeholder={isReply ? (replyKind === 'comment' ? tx('익명으로 댓글 남기기…') : tx('익명으로 답글 남기기…')) : tx('회사 얘기, 커리어 고민, AI 때문에 생긴 일… 편하게 털어놓으세요.')}
        autoFocus={autoFocus}
        rows={isReply ? 1 : 3}
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
