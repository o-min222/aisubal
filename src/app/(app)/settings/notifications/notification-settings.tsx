'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { NOTIFY_CATEGORIES, type NotifyPrefKey, type NotifyPrefs } from '@/lib/notifications'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

type Freq = 'daily' | 'weekly' | 'off'
const FREQS: { id: Freq; label: string }[] = [
  { id: 'daily', label: '매일' },
  { id: 'weekly', label: '주 1회' },
  { id: 'off', label: '끄기' },
]

/** Server-backed toggles (0048 notification_prefs): off = no new notifications of that kind. */
export function NotificationSettings({ initial }: { initial: NotifyPrefs }) {
  const [prefs, setPrefs] = useState(initial)
  const [busy, setBusy] = useState<NotifyPrefKey | null>(null)

  async function save(changes: Partial<Record<NotifyPrefKey, boolean>>) {
    const keys = Object.keys(changes) as NotifyPrefKey[]
    if (busy || !keys.length) return
    const before = prefs
    setBusy(keys[0])
    setPrefs({ ...prefs, ...changes })
    try {
      let latest = prefs
      for (const key of keys) {
        const res = await fetch('/api/notifications/prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key, on: changes[key] }) })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || tn('저장하지 못했어요.'))
        latest = data.prefs
      }
      setPrefs(latest)
    } catch (e) {
      setPrefs(before)
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(null)
    }
  }
  const toggle = (id: NotifyPrefKey) => save({ [id]: !prefs[id] })

  /** A61: '새 소식' has three settings instead of a switch */
  const freq: Freq = !prefs.digest ? 'off' : prefs.digest_weekly ? 'weekly' : 'daily'
  function setFreq(f: Freq) {
    if (f === freq) return
    if (f === 'off') return save({ digest: false })
    const changes: Partial<Record<NotifyPrefKey, boolean>> = {}
    if (!prefs.digest) changes.digest = true
    if (prefs.digest_weekly !== (f === 'weekly')) changes.digest_weekly = f === 'weekly'
    return save(changes)
  }
  return (
    <section className="card divide-y divide-n-eee">
      {NOTIFY_CATEGORIES.map((o) => {
        const on = prefs[o.id]
        if (o.id === 'digest') {
          return (
            <div key={o.id} className="p-4 flex flex-col gap-2.5">
              <span className="min-w-0">
                <span className="block text-sm font-medium text-n-333"><T>{o.title}</T></span>
                <span className="block text-xs text-n-888"><T>{o.hint}</T></span>
              </span>
              <div className="flex gap-1.5" role="radiogroup" aria-label={tx('새 소식 빈도')}>
                {FREQS.map((f) => (
                  <button key={f.id} type="button" role="radio" aria-checked={freq === f.id} disabled={busy !== null} onClick={() => setFreq(f.id)} className={`filter-chip is-sm ${freq === f.id ? 'on' : ''}`}>
                    <T>{f.label}</T>
                  </button>
                ))}
              </div>
            </div>
          )
        }
        return (
          <div key={o.id} className="p-4 flex items-center gap-3 min-h-[60px]">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-n-333"><T>{o.title}</T></span>
              <span className="block text-xs text-n-888"><T>{o.hint}</T></span>
            </span>
            <button type="button" role="switch" aria-checked={on} aria-label={tx(o.title)} disabled={busy === o.id} onClick={() => toggle(o.id)} className={`switch ${on ? 'on' : ''}`}>
              <span />
            </button>
          </div>
        )
      })}
    </section>
  )
}
