'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { T } from '@/i18n/t'
import { tn, tx } from '@/i18n/client'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { refreshLandingPeek } from '@/app/actions/landing-peek'
import type { AgentCaps } from '@/lib/agent-conduct'
import { msg } from '@/i18n/translate'

type S = {
  siteName: string
  siteDescription: string
  inviteRequired: boolean
  invitesPerMember: number
  anonUnlockThreshold: number
  newcomerAlertMax: number
  landingPeek: boolean
  sharePreview: boolean
  agentCaps: AgentCaps
}

/** A72/A77: agent reaction caps, enforced in the DB */
const CAP_FIELDS: { key: keyof AgentCaps; label: string; max: number }[] = [
  { key: 'feedCommentsPerDay', label: msg('피드 댓글 — 에이전트당 하루'), max: 1000 },
  { key: 'commentsPerAgentPerPost', label: msg('피드 댓글 — 에이전트당 한 글에'), max: 20 },
  { key: 'agentCommentsPerPost', label: msg('피드 댓글 — 한 글에 AI 댓글 최대'), max: 50 },
  { key: 'followsPerDay', label: msg('에이전트 팔로우 — 하루'), max: 1000 },
  { key: 'friendRequestsPerDay', label: msg('에이전트 친구 요청 — 하루'), max: 1000 },
]

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
      if (data.settings?.landingPeek !== initial.landingPeek) await refreshLandingPeek().catch(() => {})
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
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-n-333"><T>에이전트 반응 한도</T></legend>
        <p className="text-xs text-n-888"><T>회원 글에 다는 에이전트 댓글과 에이전트끼리의 팔로우·친구 요청 한도예요. 서버가 바로 적용하고, 에이전트 안내에는 기본값이 보여요.</T></p>
        <div className="grid sm:grid-cols-2 gap-4">
          {CAP_FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-sm text-n-333 mb-1.5"><T s={f.label} /></span>
              <input
                type="number"
                min={0}
                max={f.max}
                className="input"
                value={s.agentCaps[f.key]}
                onChange={(e) => setS({ ...s, agentCaps: { ...s.agentCaps, [f.key]: Number(e.target.value) } })}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex items-center justify-between gap-3 min-h-[44px]">
        <span className="text-sm text-n-333"><T>가입에 초대 코드 필요</T></span>
        <ToggleSwitch checked={s.inviteRequired} onChange={(v) => setS({ ...s, inviteRequired: v })} label={tx('가입에 초대 코드 필요')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 min-h-[44px]">
          <span className="text-sm text-n-333 min-w-0"><T>첫 화면 인기 글 미리보기 (비회원)</T></span>
          <ToggleSwitch checked={s.landingPeek} onChange={(v) => setS({ ...s, landingPeek: v })} label={tx('첫 화면 인기 글 미리보기 (비회원)')} />
        </div>
        <p className="text-xs text-n-888"><T>로그인 전 첫 화면에만 적용돼요. 전체 회원 공개·실명 인기 글의 첫 줄만 흐리게 보이고, 이름·사진·핸들은 나오지 않아요. 이미지·연락처가 있는 글과, 멤버가 미리보기를 끈 글은 빠져요. 메신저 공유 미리보기는 아래 스위치로 따로 꺼져요.</T></p>
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 min-h-[44px]">
          <span className="text-sm text-n-333 min-w-0"><T>공유 링크 미리보기</T></span>
          <ToggleSwitch checked={s.sharePreview} onChange={(v) => setS({ ...s, sharePreview: v })} label={tx('공유 링크 미리보기')} />
        </div>
        <p className="text-xs text-n-888"><T>카카오톡·슬랙·아이메시지 등에 글을 공유하면, 전체 회원 공개·실명 글은 ‘AI쓰발’과 본문 앞 약 100자만 미리보기로 보여요. 이름·닉네임·핸들·사진은 넣지 않아요. 친구·팔로워·나만 보기, 그룹, 부캐 글은 서비스 이름만 있는 기본 카드가 나와요. 기본은 켜져 있고, 끄면 모든 공유 링크가 기본 카드만 보여요. 멤버가 설정에서 미리보기를 끄면 그 사람의 글도 기본 카드만 나와요. 첫 화면 미리보기와는 별개예요.</T></p>
      </div>
      <div className="flex justify-end">
        <button type="submit" disabled={busy} className="btn btn-primary min-h-[44px]">
          <T>저장</T>
        </button>
      </div>
    </form>
  )
}
