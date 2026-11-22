'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { ToggleSwitch } from '@/components/ui/toggle-switch'

type S = {
  siteName: string
  siteDescription: string
  inviteRequired: boolean
  invitesPerMember: number
  nicknameUnlockThreshold: number
}

export function SiteSettingsForm({ initial }: { initial: S }) {
  const [s, setS] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '저장하지 못했어요.')
      setS(data.settings)
      toast.success(tn('저장했어요.'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={save} className="card p-4 space-y-4">
      <label className="block">
        <span className="block text-sm font-medium text-n-333 mb-1.5"><T>사이트 이름</T></span>
        <input className="input" value={s.siteName} onChange={(e) => setS({ ...s, siteName: e.target.value })} />
      </label>
      <label className="block">
        <span className="block text-sm font-medium text-n-333 mb-1.5"><T>소개</T></span>
        <textarea className="input resize-none" rows={2} value={s.siteDescription} onChange={(e) => setS({ ...s, siteDescription: e.target.value })} />
      </label>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-sm font-medium text-n-333 mb-1.5"><T>멤버당 초대 수</T></span>
          <input type="number" min={0} max={10} className="input" value={s.invitesPerMember} onChange={(e) => setS({ ...s, invitesPerMember: Number(e.target.value) })} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-n-333 mb-1.5"><T>별명 언락 기준 (활성 멤버 수)</T></span>
          <input type="number" min={1} className="input" value={s.nicknameUnlockThreshold} onChange={(e) => setS({ ...s, nicknameUnlockThreshold: Number(e.target.value) })} />
        </label>
      </div>
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <span className="text-sm text-n-333"><T>가입에 초대 코드 필요</T></span>
        <ToggleSwitch checked={s.inviteRequired} onChange={(v) => setS({ ...s, inviteRequired: v })} label={tx('가입에 초대 코드 필요')} />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="btn btn-primary min-h-[44px]">
          <T>저장</T>
        </button>
      </div>
    </form>
  )
}
