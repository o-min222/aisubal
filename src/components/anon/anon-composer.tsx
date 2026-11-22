'use client'

import { useMemo, useState } from 'react'
import { piiWarning } from '@/lib/pii'
import { useRouter } from 'next/navigation'
import { VenetianMask, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { ANON_CATEGORIES, ANON_MAX_CHARS, ANON_NOTICE, type AnonCategory } from '@/lib/anon-rules'

/** 익명 composer. Root posts pick a category; replies inherit the thread's. */
export function AnonComposer({
  parentId,
  defaultCategory,
  autoFocus,
  redirectTo,
  className = '',
}: {
  parentId?: string
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
  const [busy, setBusy] = useState(false)
  const count = [...body].length
  const over = count > ANON_MAX_CHARS
  const canSubmit = body.trim().length > 0 && !over && !busy && (isReply || category)

  const pii = useMemo(() => piiWarning(body), [body])
  const [piiAckFor, setPiiAckFor] = useState<string | null>(null)

  async function submit() {
    if (!canSubmit) {
      if (!isReply && !category && body.trim()) toast.error('카테고리를 골라주세요.')
      return
    }
    if (pii && piiAckFor !== body) {
      setPiiAckFor(body)
      toast.warning(`${pii} 익명이어도 신원이 드러날 수 있어요. 그래도 올리려면 한 번 더 눌러주세요.`)
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
      if (!res.ok) throw new Error(data.error || '게시하지 못했어요.')
      setBody('')
      toast.success(isReply ? `${data.alias}(으)로 답글을 남겼어요` : `${data.alias}(으)로 게시했어요`)
      if (redirectTo === 'thread' && !isReply) router.push(`/anon/${data.id}`)
      else router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '게시하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`composer ${className}`}>
      <div className="flex gap-3">
        <span className="w-10 h-10 rounded-full bg-[#222] text-white flex items-center justify-center flex-shrink-0" aria-hidden="true">
          <VenetianMask className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[#111]">익명</div>
          {!isReply && (
            <div className="chip-row mt-1.5" role="radiogroup" aria-label="카테고리">
              {ANON_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={category === c.id}
                  onClick={() => setCategory(c.id)}
                  className={`filter-chip ${category === c.id ? 'on' : ''}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
            }}
            placeholder={isReply ? '익명으로 답글 남기기…' : '회사 얘기, 커리어 고민, AI 때문에 생긴 일… 편하게 털어놓으세요.'}
            autoFocus={autoFocus}
            rows={isReply ? 2 : 4}
            aria-label={isReply ? '익명 답글 내용' : '익명 게시물 내용'}
            className="composer-input"
          />
          {pii && (
            <p role="alert" className="pii-warning flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-xs mb-2" style={{ background: '#fff4e5', color: '#8a4b00' }}>
              <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
              <span>{pii} 익명 글이어도 신원이 드러날 수 있어요. 지우거나 가려주세요.</span>
            </p>
          )}
          <p className="flex items-start gap-1.5 text-xs text-[#777] mb-2">
            <ShieldAlert className="w-3.5 h-3.5 mt-px flex-shrink-0" />
            <span>{ANON_NOTICE}</span>
          </p>
          <div className="flex items-center gap-2">
            <div className="ml-auto flex items-center gap-2">
              <span className={`text-xs tabular-nums ${over ? 'text-red-600' : 'text-[#999]'}`}>
                {count}/{ANON_MAX_CHARS}
              </span>
              <button
                type="button"
                onClick={submit}
                disabled={!body.trim() || over || busy}
                className="btn btn-primary btn-sm min-h-[40px] px-4 rounded-full"
              >
                {busy ? '게시 중…' : isReply ? '답글' : '익명으로 게시'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
