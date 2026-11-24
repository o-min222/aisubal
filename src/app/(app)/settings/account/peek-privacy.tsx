'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { EyeOff } from 'lucide-react'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { refreshLandingPeek } from '@/app/actions/landing-peek'
import { tn, useT } from '@/i18n/client'

/** A64: whether my 전체 회원 posts may appear (blurred, without my name) in the signed-out landing preview. */
export function PeekPrivacy({ initial }: { initial: boolean }) {
  const t = useT()
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function save(v: boolean) {
    setOn(v)
    setBusy(true)
    try {
      const res = await fetch('/api/me/peek', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: v }) })
      if (!res.ok) throw new Error()
      await refreshLandingPeek().catch(() => {})
    } catch {
      setOn(!v)
      toast.error(tn('저장하지 못했어요.'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card p-4" id="privacy" aria-label={t('개인정보 보호')}>
      <div className="flex items-start gap-3">
        <EyeOff className="w-5 h-5 text-n-666 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-n-333">{t('개인정보 보호')}</div>
          <div className="flex items-center gap-3 mt-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-n-333">{t('내 글을 비회원 미리보기에 노출')}</p>
              <p className="text-xs text-n-888">{t('로그인 전 첫 화면에 인기 글의 첫 줄만 흐리게 보여요. 이름·사진은 숨기고 링크는 지워요. 이미지·연락처가 있는 글은 빠져요.')}</p>
            </div>
            <ToggleSwitch checked={on} onChange={(v) => void save(v)} disabled={busy} label={t('내 글을 비회원 미리보기에 노출')} />
          </div>
        </div>
      </div>
    </section>
  )
}
