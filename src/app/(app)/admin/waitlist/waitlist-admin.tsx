'use client'

import { useState } from 'react'
import { Copy, EyeOff, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import type { WaitlistEntry, WaitlistStatus } from '@/lib/data/public-waitlist'
import { T } from '@/i18n/t'
import { tn, tx, useLocale } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'

const TABS: { id: WaitlistStatus; label: string }[] = [
  { id: 'waiting', label: '대기' },
  { id: 'invited', label: '초대함' },
  { id: 'dismissed', label: '숨김' },
]

export function WaitlistAdmin({ initial, waiting }: { initial: WaitlistEntry[]; waiting: number }) {
  const locale = useLocale()
  const [tab, setTab] = useState<WaitlistStatus>('waiting')
  const [rows, setRows] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function load(s: WaitlistStatus) {
    setTab(s)
    const d = await fetch(`/api/admin/waitlist?status=${s}`).then((r) => r.json()).catch(() => null)
    setRows(d?.entries ?? [])
  }

  async function act(id: string, action: 'invite' | 'dismiss' | 'restore') {
    if (busy) return
    setBusy(id)
    try {
      const res = await fetch('/api/admin/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action }) })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || tn('처리에 실패했어요.'))
      if (action === 'invite') {
        setRows((rs) => rs.map((r) => (r.id === id ? { ...r, code: d.code, status: 'invited' } : r)))
        await copyInvite(d.code)
      } else {
        setRows((rs) => rs.filter((r) => r.id !== id))
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tn('처리에 실패했어요.'))
    } finally {
      setBusy(null)
    }
  }

  async function copyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/i/${code}`)
      toast.success(tn('초대 링크를 복사했어요. 직접 보내 주세요.'))
    } catch {
      /* clipboard blocked: the code is on screen */
    }
  }

  return (
    <div className="card p-3 wl">
      <div className="wl-head">
        <div className="wl-tabs" role="radiogroup">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tab === t.id} className={`filter-chip is-sm ${tab === t.id ? "on" : ""}`} onClick={() => load(t.id)}>
              <T>{t.label}</T>{t.id === 'waiting' && waiting > 0 ? ` ${waiting}` : ''}
            </button>
          ))}
        </div>
        <a href="/join" target="_blank" rel="noreferrer" className="text-link wl-open">/join</a>
      </div>
      {rows.length === 0 ? (
        <p className="wl-empty"><T>아직 없어요.</T></p>
      ) : (
        <ul className="wl-list">
          {rows.map((r) => (
            <li key={r.id} className="wl-row">
              <div className="wl-main">
                <p className="wl-email">{r.email}</p>
                {r.reason && <p className="wl-reason">{r.reason}</p>}
                <p className="wl-meta">
                  {new Date(r.created_at).toLocaleDateString(LOCALE_META[locale].intl, { timeZone: 'Asia/Seoul' })}
                  {r.source ? ` · ${r.source}` : ''}
                  {r.locale ? ` · ${r.locale}` : ''}
                  {r.code && r.used ? ` · ${tx('가입함')}` : ''}
                </p>
              </div>
              <div className="wl-actions">
                {r.code ? (
                  <>
                    <code className="wl-code">{r.code}</code>
                    <button type="button" className="icon-btn" onClick={() => copyInvite(r.code as string)} aria-label={tx('초대 링크 복사')} title={tx('초대 링크 복사')}>
                      <Copy className="w-4 h-4" />
                    </button>
                  </>
                ) : r.status === 'dismissed' ? (
                  <button type="button" className="icon-btn" disabled={busy === r.id} onClick={() => act(r.id, 'restore')} aria-label={tx('대기로 되돌리기')} title={tx('대기로 되돌리기')}>
                    <Undo2 className="w-4 h-4" />
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary wl-invite" disabled={busy === r.id} onClick={() => act(r.id, 'invite')}>
                      <T>초대</T>
                    </button>
                    <button type="button" className="icon-btn" disabled={busy === r.id} onClick={() => act(r.id, 'dismiss')} aria-label={tx('숨기기')} title={tx('숨기기')}>
                      <EyeOff className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
