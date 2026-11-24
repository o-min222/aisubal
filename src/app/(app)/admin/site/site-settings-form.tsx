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
  anonUnlockThreshold: number
  newcomerAlertMax: number
  landingPeek: boolean
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
          <span className="block text-xs text-n-888 mt-1"><T>모두 가입하면 바로 이 수만큼 새 초대장이 다시 채워져요 (시간이 지나서 생기지는 않아요)</T></span>
        </label>
        <label className="block">
          <span className="block text-sm font-medium text-n-333 mb-1.5"><T>익명 라운지 오픈 기준 (활성 멤버 수)</T></span>
          <input type="number" min={1} className="input" value={s.anonUnlockThreshold} onChange={(e) => setS({ ...s, anonUnlockThreshold: Number(e.target.value) })} />
        </label>
      </div>
      <label className="block">
        <span className="block text-sm font-medium text-n-333 mb-1.5"><T>새 멤버 첫 글 알림 — 운영진에게도 보내는 기준 (가입 멤버 수)</T></span>
        <input type="number" min={0} className="input" value={s.newcomerAlertMax} onChange={(e) => setS({ ...s, newcomerAlertMax: Number(e.target.value) })} />
        <span className="block text-xs text-n-888 mt-1"><T>가입 멤버가 이 수 이하일 때 새 멤버의 첫 글을 모든 운영진에게도 알려요. 0이면 초대한 사람에게만 가요.</T></span>
      </label>
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <span className="text-sm text-n-333"><T>가입에 초대 코드 필요</T></span>
        <ToggleSwitch checked={s.inviteRequired} onChange={(v) => setS({ ...s, inviteRequired: v })} label={tx('가입에 초대 코드 필요')} />
      </div>
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <span className="min-w-0">
          <span className="block text-sm text-n-333"><T>첫 화면 인기 글 미리보기 (비회원)</T></span>
          <span className="block text-xs text-n-888"><T>로그인 전 첫 화면에 전체 회원 공개 인기 글의 첫 줄만 흐리게 보여요. 끄면 바로 사라져요.</T></span>
        </span>
        <ToggleSwitch checked={s.landingPeek} onChange={(v) => setS({ ...s, landingPeek: v })} label={tx('첫 화면 인기 글 미리보기 (비회원)')} />
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="btn btn-primary min-h-[44px]">
          <T>저장</T>
        </button>
      </div>
    </form>
  )
}
