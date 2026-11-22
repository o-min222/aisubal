'use client'

import Link from 'next/link'
import { ChevronRight, Globe, LogOut, Mail, ShieldCheck } from 'lucide-react'
import { signOut } from '@/components/shell/sign-out'
import { LocaleSwitch } from '@/components/i18n/locale-switch'
import { useLocale, useT } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'

export function AccountSettings({ email, joinedAt, isAdmin }: { email: string; joinedAt: string | null; isAdmin: boolean }) {
  const t = useT()
  const locale = useLocale()
  return (
    <div className="space-y-4">
      <section className="card divide-y divide-[#eee]">
        <div className="p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-[#666] mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#333]">{t('로그인 이메일')}</div>
            <div className="text-sm text-[#666] truncate">{email || t('(이메일 비공개)')}</div>
            <p className="text-xs text-[#888] mt-1">{t('본인만 확인할 수 있고 피드·게시물에 노출되지 않아요.')}</p>
          </div>
        </div>
        <div className="p-4 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-[#666] mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-[#333]">{t('멤버십')}</div>
            <div className="text-[#666]">
              {isAdmin ? t('관리자') : t('멤버')}
              {joinedAt ? ` · ${t('{date} 가입', { date: new Date(joinedAt).toLocaleDateString(LOCALE_META[locale].intl, { timeZone: 'Asia/Seoul' }) })}` : ''}
            </div>
          </div>
        </div>
        <Link href="/settings/profile" className="p-4 flex items-center gap-3 min-h-[56px] hover:bg-[#fafafa]">
          <span className="text-sm font-medium text-[#333]">{t('프로필 편집')}</span>
          <ChevronRight className="w-4 h-4 ml-auto text-[#bbb]" />
        </Link>
      </section>

      <section className="card p-4" id="language">
        <div className="flex items-start gap-3">
          <Globe className="w-5 h-5 text-[#666] mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[#333]">{t('언어')}</div>
            <p className="text-xs text-[#888] mb-3">{t('이 브라우저와 내 계정에 저장돼요. 다른 기기에서 로그인해도 그대로예요.')}</p>
            <LocaleSwitch variant="block" />
          </div>
        </div>
      </section>

      <section className="card p-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-medium text-[#333]">{t('로그아웃')}</p>
          <p className="text-xs text-[#888]">{t('이 기기에서 로그아웃합니다.')}</p>
        </div>
        <button type="button" onClick={signOut} className="btn btn-secondary btn-sm min-h-[40px]">
          <LogOut className="w-4 h-4" /> {t('로그아웃')}
        </button>
      </section>
    </div>
  )
}
