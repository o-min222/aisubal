'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeHandle } from '@/lib/profile-rules'
import { CHECK_LABEL, formatHandleDate, type HandleStatus } from '@/lib/handle-policy'
import { T } from '@/i18n/t'
import { tx, useLocale } from '@/i18n/client'

/**
 * Inline @handle editing (0032 policy): type in place → debounced availability check →
 * one inline confirm row warning that the old handle is held for 14 days. No stacked form.
 */
export function HandleField({ initial, onChanged }: { initial: string; onChanged?: (h: string) => void }) {
  const router = useRouter()
  const locale = useLocale()
  const [current, setCurrent] = useState(initial)
  const [value, setValue] = useState(initial)
  const [status, setStatus] = useState<HandleStatus | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const seq = useRef(0)
  const v = normalizeHandle(value)
  const dirty = v !== current

  // quota + history once, then a debounced check whenever the candidate changes
  useEffect(() => {
    const n = ++seq.current
    const q = dirty && v ? `?h=${encodeURIComponent(v)}` : ''
    setChecking(Boolean(q))
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/profile/handle${q}`, { cache: 'no-store' })
        const d = await res.json()
        if (n === seq.current && res.ok && d.quota) setStatus(d as HandleStatus)
      } catch {}
      if (n === seq.current) setChecking(false)
    }, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [v, dirty])

  const check = dirty && status?.check?.handle === v ? status.check : null
  const quota = status?.quota
  const free = Boolean(status?.firstIsFree)
  const canChange = free || (quota?.remaining ?? 0) > 0
  const okToApply = Boolean(check && (check.state === 'available' || check.state === 'own_hold') && canChange)

  async function apply() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/profile/handle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: v }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || tx('저장하지 못했어요.'))
      setStatus(d as HandleStatus)
      setCurrent(v)
      setConfirming(false)
      onChanged?.(v)
      toast.success(tx('핸들을 @{h}(으)로 바꿨어요.', { h: v }))
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : tx('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }

  function revert() {
    setValue(current)
    setConfirming(false)
    setErr(null)
  }

  const note = !quota ? null
    : free ? tx('첫 핸들은 변경 횟수에 들어가지 않아요.')
    : quota.remaining > 0
      ? tx('14일 동안 {n}번 더 바꿀 수 있어요.', { n: quota.remaining }) + (quota.remaining < quota.limit && quota.refillAt ? ' ' + tx('({date}에 1번 더 생겨요)', { date: formatHandleDate(quota.refillAt, locale) }) : '')
      : tx('다음 변경은 {date}부터 가능해요.', { date: formatHandleDate(quota.nextAt, locale) })

  return (
    <div className="handle-field">
      <label className="pe-handle">
        <span aria-hidden>@</span>
        <input
          className="pe-inline"
          value={value}
          maxLength={20}
          placeholder="handle"
          aria-label={tx('핸들')}
          aria-invalid={Boolean(check && !okToApply && check.state !== 'same') || Boolean(err)}
          aria-describedby="handle-note"
          onChange={(e) => {
            setValue(e.target.value.replace(/^@/, ''))
            setConfirming(false)
            setErr(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') revert()
            if (e.key === 'Enter') {
              e.preventDefault()
              if (okToApply) setConfirming(true)
            }
          }}
        />
        {dirty && (checking ? <Loader2 className="w-3.5 h-3.5 animate-spin text-n-888" aria-hidden /> : okToApply ? <Check className="w-3.5 h-3.5 text-c-0a7a3d" aria-hidden /> : check ? <X className="w-3.5 h-3.5 text-c-b42318" aria-hidden /> : null)}
      </label>
      <p id="handle-note" className="handle-note" aria-live="polite">
        {err ? <span className="text-c-b42318">{err}</span>
          : dirty && check && !checking ? (
            <span className={okToApply ? 'text-c-0a7a3d' : 'text-c-b42318'}>
              {okToApply || check.state === 'same' ? tx(CHECK_LABEL[check.state]) : !canChange && (check.state === 'available' || check.state === 'own_hold') ? note : tx(CHECK_LABEL[check.state])}
            </span>
          ) : note}
      </p>
      {dirty && okToApply && !confirming && !checking && (
        <button type="button" className="handle-cta" onClick={() => setConfirming(true)}>
          <T s="@{h}(으)로 바꾸기" vars={{ h: v }} />
        </button>
      )}
      {confirming && (
        <div className="handle-confirm" role="alertdialog" aria-label={tx('핸들 변경 확인')}>
          <p>
            <AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5 mr-1" aria-hidden />
            {free ? <T s="@{h}(으)로 정할까요?" vars={{ h: v }} /> : (
              <T s="@{old}은(는) 14일 동안 나만 되돌릴 수 있게 보호되고, 그 뒤엔 누구나 쓸 수 있어요. 이번 변경으로 14일 동안 남은 변경은 {n}번이에요." vars={{ old: current, n: Math.max(0, (quota?.remaining ?? 1) - 1) }} />
            )}
          </p>
          <div className="handle-confirm-row">
            <button type="button" className="btn btn-primary btn-sm rounded-full" disabled={busy} onClick={() => void apply()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <T s="@{h}(으)로 바꾸기" vars={{ h: v }} />}
            </button>
            <button type="button" className="handle-cancel" onClick={revert}><T>취소</T></button>
          </div>
        </div>
      )}
      {status && status.history.length > 0 && (
        <details className="handle-history">
          <summary><T>핸들 변경 기록 (나만 보여요)</T></summary>
          <ul>
            {status.history.map((r) => (
              <li key={r.changedAt}>
                @{r.old} → @{r.new} · {formatHandleDate(r.changedAt, locale)}
                {new Date(r.releasedAt).getTime() > Date.now() ? <> · <T s="@{h} 보호 중 ({date}까지)" vars={{ h: r.old, date: formatHandleDate(r.releasedAt, locale) }} /></> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}
