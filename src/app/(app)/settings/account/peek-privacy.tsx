'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { EyeOff } from 'lucide-react'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { refreshLandingPeek } from '@/app/actions/landing-peek'
import { tn, useT } from '@/i18n/client'

/** A64 / A101: whether my 전체 회원 posts may appear in the signed-out landing peek and in share-link previews (neither includes my name). */
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
          <div className="flex flex-col gap-1.5 mt-2">
            <div className="flex items-center justify-between gap-3 min-h-[44px]">
              <p className="text-sm text-n-333 min-w-0">{t('내 글을 비회원 미리보기에 노출')}</p>
              <ToggleSwitch checked={on} onChange={(v) => void save(v)} disabled={busy} label={t('내 글을 비회원 미리보기에 노출')} />
            </div>
            <p className="text-xs text-n-888">{t('이 설정은 두 곳에 함께 적용돼요. (1) 로그인 전 첫 화면의 인기 글 미리보기 — 첫 줄만 흐리게, 이름·사진은 숨기고 링크는 지워요. 이미지·연락처가 있는 글은 빠져요. (2) 다른 사람이 내 글을 메신저로 공유할 때 붙는 카드 — ‘AI쓰발’과 본문 앞 약 100자만 나오고, 이름·닉네임·핸들·사진은 넣지 않아요. 꺼 두면 첫 화면에서는 빠지고, 공유 링크는 기본 카드만 나와요.')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}
