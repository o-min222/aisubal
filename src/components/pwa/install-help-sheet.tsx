'use client'

import { EllipsisVertical, Menu, Share, SquarePlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { AdaptiveSheet } from '@/components/adaptive-sheet'
import { useT } from '@/i18n/client'
import { androidBrowser } from '@/lib/pwa-install'

type Step = { icon: ReactNode; text: string }

/**
 * '앱 설치' when the browser gives us no prompt: iOS Safari (공유 → 홈 화면에 추가 → 추가), and
 * Android Chrome / Samsung Internet that didn't fire beforeinstallprompt (A89: browser menu steps).
 */
export function InstallHelpSheet({ platform, open, onOpenChange }: { platform: 'ios' | 'android'; open: boolean; onOpenChange: (o: boolean) => void }) {
  const t = useT()
  const samsung = platform === 'android' && typeof navigator !== 'undefined' && androidBrowser(navigator.userAgent) === 'samsung'
  const steps: Step[] =
    platform === 'ios'
      ? [
          { icon: <Share className="w-4 h-4" />, text: t('Safari 아래쪽(iPad는 위쪽) 막대에서 공유 버튼을 눌러요.') },
          { icon: <SquarePlus className="w-4 h-4" />, text: t('목록을 내려 ‘홈 화면에 추가’를 골라요.') },
          { icon: <span className="ios-install-text">{t('추가')}</span>, text: t('오른쪽 위 ‘추가’를 누르면 끝이에요.') },
        ]
      : samsung
        ? [
            { icon: <Menu className="w-4 h-4" />, text: t('아래쪽 메뉴(≡)를 눌러요.') },
            { icon: <SquarePlus className="w-4 h-4" />, text: t('‘현재 페이지 추가’ → ‘홈 화면’을 골라요.') },
          ]
        : [
            { icon: <EllipsisVertical className="w-4 h-4" />, text: t('Chrome 오른쪽 위 메뉴(⋮)를 눌러요.') },
            { icon: <SquarePlus className="w-4 h-4" />, text: t('‘앱 설치’ 또는 ‘홈 화면에 추가’를 골라요.') },
          ]
  return (
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} title={t('앱 설치')}>
      <div className="ios-install">
        <p className="text-sm text-n-555">{t('AI쓰발을 앱처럼 홈 화면에서 바로 열 수 있어요.')}</p>
        <ol className="ios-install-steps">
          {steps.map((s, i) => (
            <li key={i}>
              <span className="ios-install-icon" aria-hidden>{s.icon}</span>
              <span>{s.text}</span>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-primary btn-sm rounded-full w-full min-h-[40px]" onClick={() => onOpenChange(false)}>
          {t('확인')}
        </button>
      </div>
    </AdaptiveSheet>
  )
}
