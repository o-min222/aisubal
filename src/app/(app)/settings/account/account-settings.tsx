'use client'

import Link from 'next/link'
import { Suspense } from 'react'
import { ChevronRight, Globe, LogOut, Moon, ShieldCheck } from 'lucide-react'
import { signOut } from '@/components/shell/sign-out'
import { LocaleSwitch } from '@/components/i18n/locale-switch'
import { ThemeSwitch } from '@/components/theme/theme-switch'
import { useLocale, useT } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'
import type { LoginIdentity } from '@/lib/login-identities'
import { LoginEmails } from './login-emails'

export function AccountSettings({
  email,
  identities,
  mock,
  joinedAt,
  isAdmin,
}: {
  email: string
  identities: LoginIdentity[]
  mock: boolean
  joinedAt: string | null
  isAdmin: boolean
}) {
  const t = useT()
  const locale = useLocale()
  return (
    <div className="space-y-4">
      <section className="card divide-y divide-n-eee">
        <Suspense fallback={null}>
          <LoginEmails identities={identities} accountEmail={email} mock={mock} />
        </Suspense>
        <div className="p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-n-666 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-n-333">{t('멤버십')}</div>
            <div className="text-n-666">
              {isAdmin ? t('관리자') : t('멤버')}
              {joinedAt ? ` · ${t('{date} 가입', { date: new Date(joinedAt).toLocaleDateString(LOCALE_META[locale].intl, { timeZone: 'Asia/Seoul' }) })}` : ''}
            </div>
          </div>
        </div>
        <Link href="/settings/profile" className="p-4 flex items-center gap-3 min-h-[56px] hover:bg-n-fafafa">
          <span className="text-sm font-medium text-n-333">{t('프로필 편집')}</span>
          <ChevronRight className="w-4 h-4 ml-auto text-n-bbb" />
        </Link>
      </section>

      <section className="card p-4" id="language">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-n-666 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-n-333">{t('언어')}</div>
            <p className="text-xs text-n-888 mb-3">{t('이 브라우저와 내 계정에 저장돼요. 다른 기기에서 로그인해도 그대로예요.')}</p>
            <LocaleSwitch variant="block" />
          </div>
        </div>
      </section>

      <section className="card p-4" id="theme">
        <div className="flex items-start gap-3">
          <Moon className="w-5 h-5 text-n-666 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-n-333">{t('화면 모드')}</div>
            <p className="text-xs text-n-888 mb-3">{t('시스템을 고르면 기기 설정을 따라가요. 이 브라우저와 내 계정에 저장돼요.')}</p>
            <ThemeSwitch variant="block" />
          </div>
        </div>
      </section>

      <section className="card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-n-333">{t('로그아웃')}</p>
          <p className="text-xs text-n-888">{t('이 기기에서 로그아웃합니다.')}</p>
        </div>
        <button type="button" onClick={signOut} className="btn btn-secondary btn-sm min-h-[40px]">
          <LogOut className="w-4 h-4" /> {t('로그아웃')}
        </button>
      </section>
    </div>
  )
}
