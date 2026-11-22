'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { NOTIFY_CATEGORIES, type NotifyCategory, type NotifyPrefs } from '@/lib/notifications'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'

/** Server-backed toggles (0048 notification_prefs): off = no new notifications of that kind. */
export function NotificationSettings({ initial }: { initial: NotifyPrefs }) {
  const [prefs, setPrefs] = useState(initial)
  const [busy, setBusy] = useState<NotifyCategory | null>(null)
  async function toggle(id: NotifyCategory) {
    if (busy) return
    const next = !prefs[id]
    setBusy(id)
    setPrefs({ ...prefs, [id]: next })
    try {
      const res = await fetch('/api/notifications/prefs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: id, on: next }) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.')
      setPrefs(data.prefs)
    } catch (e) {
      setPrefs((p) => ({ ...p, [id]: !next }))
      toast.error(e instanceof Error ? e.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(null)
    }
  }
  return (
    <section className="card divide-y divide-n-eee">
      {NOTIFY_CATEGORIES.map((o) => {
        const on = prefs[o.id]
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
