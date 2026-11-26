'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { RelativeTime } from '@/components/relative-time'
import { FeedbackStatusBadge } from '@/components/feedback/feedback-status'
import type { FeedbackItem } from '@/lib/feedback'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

type Action = 'approve' | 'reject' | 'in_progress' | 'deployed' | 'resend'

/** A105: one feedback — screenshot (box already drawn in), context, then 승인 / 거절 / 진행 중 / 배포됨. */
export function FeedbackDetail({ initial }: { initial: FeedbackItem }) {
  const [f, setF] = useState(initial)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<Action | null>(null)

  async function act(action: Action) {
    if (action === 'reject' && !confirm(tn('이 피드백을 거절할까요?'))) return
    setBusy(action)
    try {
      const res = await fetch(`/api/admin/feedback/${f.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, note: note.trim() || null }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || tn('처리하지 못했어요.'))
      if (data.item) setF(data.item)
      setNote('')
      const w = data.webhook as { status?: string } | undefined
      if (w?.status === 'sent') toast.success(tn('승인했어요 · 개발 요청을 보냈어요'))
      else if (w?.status === 'skipped') toast.success(tn('승인했어요 · 웹훅이 아직 설정되지 않아 개발 요청은 보내지 않았어요'))
      else if (w?.status === 'failed') toast.error(tn('승인했어요 · 개발 요청을 보내지 못했어요'))
      else toast.success(tn('저장했어요.'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리하지 못했어요.'))
    } finally {
      setBusy(null)
    }
  }

  const vp = f.viewport
  const box = f.bbox
  const rows: Array<[string, string | null]> = [
    [tx('화면'), f.route],
    [tx('크기'), vp?.width ? `${vp.width}×${vp.height}${vp.dpr ? ` @${vp.dpr}x` : ''}` : null],
    [tx('테마 · 언어'), [f.theme === 'dark' ? tx('다크') : f.theme === 'light' ? tx('라이트') : null, f.locale].filter(Boolean).join(' · ') || null],
    [tx('요소'), f.selector],
    [tx('요소 글자'), f.elementText],
    [tx('컴포넌트'), f.component],
    [tx('위치'), box?.width ? `x ${box.x}, y ${box.y} · ${box.width}×${box.height}` : null],
    [tx('기기'), f.userAgent],
  ]
  const canApprove = f.status === 'pending' || f.status === 'rejected'
  const canReject = f.status === 'pending' || f.status === 'approved'
  const canProgress = f.status === 'approved'
  const canDeploy = f.status === 'approved' || f.status === 'in_progress'
  const canResend = (f.status === 'approved' || f.status === 'in_progress') && f.webhookStatus !== 'sent'

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <FeedbackStatusBadge status={f.status} />
          <span className="text-xs text-n-888">
            {f.author ? <Link href={`/members/${f.author.id}`} className="text-n-555">{f.author.name}</Link> : tx('멤버')} · <RelativeTime date={f.createdAt} />
          </span>
        </div>
        <p className="text-[15px] text-n-111 whitespace-pre-wrap break-words">{f.body}</p>
      </div>

      {f.hasShot ? (
        <a href={`/api/feedback-shot/${f.id}`} target="_blank" rel="noreferrer" className="card block overflow-hidden fb-shot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/feedback-shot/${f.id}`} alt={tx('피드백 스크린샷 (빨간 상자가 고른 곳)')} />
        </a>
      ) : (
        <div className="card p-4 text-sm text-n-888"><T>스크린샷 없이 왔어요. 아래 위치 정보를 봐 주세요.</T></div>
      )}

      <dl className="card p-4 fb-meta">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="fb-meta-row">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      {(f.webhookStatus || f.adminNote || f.progressNote) && (
        <div className="card p-4 space-y-1.5 text-sm">
          {f.adminNote && <p className="text-n-333"><T s="관리자 메모: {note}" vars={{ note: f.adminNote }} /></p>}
          {f.webhookStatus && (
            <p className={f.webhookStatus === 'sent' ? 'text-n-555' : 'text-c-b42318'}>
              {f.webhookStatus === 'sent' ? tx('개발 요청을 보냈어요') : f.webhookStatus === 'skipped' ? tx('개발 요청을 보내지 않았어요 — 웹훅이 아직 설정되지 않았어요') : tx('개발 요청을 보내지 못했어요')}
              {f.webhookNote ? ` (${f.webhookNote})` : ''}
              {f.webhookAt && <> · <RelativeTime date={f.webhookAt} /></>}
            </p>
          )}
          {f.progressNote && (
            <p className="text-n-555">
              <T s="진행 메모: {note}" vars={{ note: f.progressNote }} />
              {f.progressAt && <> · <RelativeTime date={f.progressAt} /></>}
            </p>
          )}
        </div>
      )}

      <div className="card p-4 space-y-3">
        <textarea className="input" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={tx('메모 (선택) — 승인하면 개발 요청에 같이 가요')} aria-label={tx('관리자 메모')} />
        <div className="flex flex-wrap gap-2 justify-end">
          {canReject && (
            <button type="button" className="btn btn-secondary min-h-[44px]" disabled={busy !== null} onClick={() => act('reject')}>
              <T>거절</T>
            </button>
          )}
          {canResend && (
            <button type="button" className="btn btn-secondary min-h-[44px]" disabled={busy !== null} onClick={() => act('resend')}>
              {busy === 'resend' ? <T>보내는 중…</T> : <T>개발 요청 다시 보내기</T>}
            </button>
          )}
          {canProgress && (
            <button type="button" className="btn btn-secondary min-h-[44px]" disabled={busy !== null} onClick={() => act('in_progress')}>
              <T>진행 중</T>
            </button>
          )}
          {canDeploy && (
            <button type="button" className="btn btn-secondary min-h-[44px]" disabled={busy !== null} onClick={() => act('deployed')}>
              <T>배포됨</T>
            </button>
          )}
          {canApprove && (
            <button type="button" className="btn btn-primary min-h-[44px]" disabled={busy !== null} onClick={() => act('approve')}>
              {busy === 'approve' ? <T>보내는 중…</T> : <T>승인 · 개발 요청</T>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
