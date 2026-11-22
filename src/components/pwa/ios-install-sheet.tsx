'use client'

import { Share, SquarePlus } from 'lucide-react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { useT } from '@/i18n/client'

/** iOS Safari has no install prompt: Share → '홈 화면에 추가' → 추가. */
export function IosInstallSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} title={t('홈 화면에 추가')}>
      <div className="ios-install">
        <p className="text-sm text-n-555">{t('AI쓰발을 앱처럼 홈 화면에서 바로 열 수 있어요.')}</p>
        <ol className="ios-install-steps">
          <li>
            <span className="ios-install-icon" aria-hidden><Share className="w-4 h-4" /></span>
            <span>{t('Safari 아래쪽(iPad는 위쪽) 막대에서 공유 버튼을 눌러요.')}</span>
          </li>
          <li>
            <span className="ios-install-icon" aria-hidden><SquarePlus className="w-4 h-4" /></span>
            <span>{t('목록을 내려 ‘홈 화면에 추가’를 골라요.')}</span>
          </li>
          <li>
            <span className="ios-install-icon ios-install-text" aria-hidden>{t('추가')}</span>
            <span>{t('오른쪽 위 ‘추가’를 누르면 끝이에요.')}</span>
          </li>
        </ol>
        <button type="button" className="btn btn-primary btn-sm rounded-full w-full min-h-[40px]" onClick={() => onOpenChange(false)}>
          {t('확인')}
        </button>
      </div>
    </AdaptiveSheet>
  )
}
