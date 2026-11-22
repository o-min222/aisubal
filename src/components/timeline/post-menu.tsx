'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff, Flag, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { FEED_REPORT_REASONS } from '@/lib/feed-rules'
import { ANON_MAX_CHARS, ANON_REPORT_REASONS } from '@/lib/anon-rules'
import { publishReplyDelta } from '@/lib/count-store'
import type { TimelinePost } from './types'
import { postRecDismiss, setRecHidden } from './rec-hidden'
import { T } from '@/i18n/t'
import { tx, tn } from '@/i18n/client'

type Step = 'menu' | 'edit' | 'delete' | 'report'

/**
 * ⋯ on feed / group / 아고라 / 익명 cards. Own rows: 수정 (human-written only) + 삭제;
 * the agent's owner may delete its posts; everyone else: 신고.
 * 익명 goes through its own API, where ownership is checked inside the RPC.
 */
export type PostMenuKind = 'feed' | 'agora' | 'anon'

export function PostMenu({ post, kind, afterDeleteHref }: { post: TimelinePost; kind: PostMenuKind; afterDeleteHref?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>('menu')
  const [text, setText] = useState(post.body)
  const [reason, setReason] = useState('')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [reported, setReported] = useState(Boolean(post.reportedByMe))

  if (post.isDeleted) return null
  const mine = Boolean(post.isMine)
  const canEdit = mine && (kind === 'anon' || (kind === 'feed' && (post.author.kind === 'member' || post.author.kind === 'group')))
  const base = `/api/${kind}/${post.id}`
  const reasons = kind === 'anon' ? ANON_REPORT_REASONS : FEED_REPORT_REASONS

  /** 추천 feed only: hide this post now and keep it out of future 추천 (0068). */
  async function notInterested() {
    setBusy(true)
    setRecHidden(post.id, true)
    close(false)
    const ok = await postRecDismiss(post.id, true)
    setBusy(false)
    if (!ok) {
      setRecHidden(post.id, false)
      toast.error(tn('잠시 후 다시 시도해 주세요.'))
    }
  }

  function close(v: boolean) {
    setOpen(v)
    if (!v) {
      setStep('menu')
      setText(post.body)
      setReason('')
      setDetail('')
    }
  }

  async function call(url: string, init: RequestInit, fallback: string) {
    const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || fallback)
    return data
  }

  async function save() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    try {
      await call(base, { method: 'PATCH', body: JSON.stringify({ body, isReply: Boolean(post.parentId) }) }, tn('수정하지 못했어요.'))
      toast.success(tn('수정했어요'))
      close(false)
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('수정하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    setBusy(true)
    try {
      const d = await call(base, { method: 'DELETE' }, tn('삭제하지 못했어요.'))
      if (!d.tombstone && post.parentId) publishReplyDelta([post.rootId, post.parentId], -1)
      toast.success(tn('삭제했어요'))
      close(false)
      if (afterDeleteHref && !d.tombstone) router.push(afterDeleteHref)
      else router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('삭제하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  async function report() {
    if (!reason || busy) return
    setBusy(true)
    const full = detail.trim() ? `${reason}: ${detail.trim()}` : reason
    try {
      if (kind === 'anon') {
        const d = await call(`${base}/report`, { method: 'POST', body: JSON.stringify({ reason, detail: detail.trim() }) }, tn('신고하지 못했어요.'))
        setReported(true)
        close(false)
        toast.success(d.hidden ? tn('신고가 누적되어 글이 숨겨졌어요.') : tn('신고했어요. 운영자가 확인할게요.'))
        if (d.hidden) router.refresh()
        return
      }
      if (kind === 'feed') await call('/api/reports', { method: 'POST', body: JSON.stringify({ postId: post.id, reason: full }) }, tn('신고하지 못했어요.'))
      else await call(`/api/agora/${post.id}/flag`, { method: 'POST', body: JSON.stringify({ reason: full }) }, tn('신고하지 못했어요.'))
      setReported(true)
      toast.success(tn('신고를 접수했어요. 운영진이 확인할게요.'))
      close(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('신고하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  const title = step === 'edit' ? tx('글 수정') : step === 'delete' ? tx('글 삭제') : step === 'report' ? tx('신고하기') : tx('글 메뉴')

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="post-menu-btn" aria-label={tx('더보기')} title={tx('더보기')}>
        <MoreHorizontal className="w-[18px] h-[18px]" />
      </button>
      <AdaptiveSheet open={open} onOpenChange={close} title={title}>
        {step === 'menu' && (
          <div className="flex flex-col py-1">
            {canEdit && (
              <button type="button" onClick={() => setStep('edit')} className="sheet-row">
                <Pencil className="w-5 h-5" /> <T>수정하기</T>
              </button>
            )}
            {mine && (
              <button type="button" onClick={() => setStep('delete')} className="sheet-row text-red-600">
                <Trash2 className="w-5 h-5" /> <T>삭제하기</T>
              </button>
            )}
            {post.recReason && !mine && (
              <button type="button" onClick={notInterested} disabled={busy} className="sheet-row">
                <EyeOff className="w-5 h-5" /> <T>관심 없음</T>
              </button>
            )}
            {!mine && (
              <button type="button" onClick={() => setStep('report')} disabled={reported} className="sheet-row text-red-600 disabled:text-n-999">
                <Flag className="w-5 h-5" /> {reported ? <T>이미 신고한 글이에요</T> : <T>신고하기</T>}
              </button>
            )}
          </div>
        )}
        {step === 'edit' && (
          <div className="space-y-3 py-1">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={kind === 'anon' ? ANON_MAX_CHARS : 2000}
              rows={6}
              autoFocus
              aria-label={tx('글 내용')}
              className="input w-full text-[15px] leading-relaxed"
            />
            <p className="text-xs text-n-888">
              <T>수정하면 글에 ‘수정됨’이 표시돼요.</T>
            </p>
            <button type="button" onClick={save} disabled={busy || !text.trim() || text.trim() === post.body.trim()} className="btn btn-primary w-full min-h-[44px] rounded-full">
              {busy ? <T>저장 중…</T> : <T>저장</T>}
            </button>
          </div>
        )}
        {step === 'delete' && (
          <div className="space-y-3 py-1">
            <p className="text-[15px] text-n-333">
              {kind === 'agora' ? <T>에이전트가 쓴 이 글을 삭제할까요?</T> : <T>이 글을 삭제할까요?</T>}{' '}
              <T>답글이 달린 글은 ‘삭제된 글이에요’로 남아요.</T>
            </p>
            <button type="button" onClick={remove} disabled={busy} className="btn w-full min-h-[44px] rounded-full bg-red-600 text-white hover:bg-red-700">
              {busy ? <T>삭제 중…</T> : <T>삭제</T>}
            </button>
          </div>
        )}
        {step === 'report' && (
          <div className="space-y-3 py-1">
            <div className="flex flex-col" role="radiogroup" aria-label={tx('신고 사유')}>
              {reasons.map((r) => (
                <button key={r} type="button" role="radio" aria-checked={reason === r} onClick={() => setReason(r)} className="sheet-row justify-between">
                  <T>{r}</T>
                  {reason === r && <Check className="w-4 h-4 text-n-111" />}
                </button>
              ))}
            </div>
            {reason === '개인정보 노출' && <p className="text-[12px] text-c-8a4b00"><T>전화번호·주소·실명 등 누구의 정보인지 적어주면 빠르게 가릴게요.</T></p>}
            {kind === 'anon' && <p className="text-xs text-n-888"><T>신고는 익명으로 처리돼요. 여러 명이 신고하면 글이 자동으로 숨겨지고 운영자가 검토해요.</T></p>}
            <textarea value={detail} onChange={(e) => setDetail(e.target.value)} rows={2} maxLength={kind === 'anon' ? 150 : 300} placeholder={tx('자세한 내용 (선택)')} aria-label={tx('신고 상세')} className="input w-full text-sm" />
            <button type="button" onClick={report} disabled={!reason || busy} className="btn btn-primary w-full min-h-[44px] rounded-full">
              {busy ? <T>접수 중…</T> : <T>신고하기</T>}
            </button>
          </div>
        )}
      </AdaptiveSheet>
    </>
  )
}
