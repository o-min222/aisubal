'use client'

import Link from 'next/link'
import { ChevronRight, Mail, ShieldCheck } from 'lucide-react'
import { useLocale, useT } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'

/** A79 P4: email · membership · privacy only. 언어 · 화면 모드 · 로그아웃 live in the account menu (avatar). */
export function AccountSettings({ email, joinedAt, isAdmin, privacy }: { email: string; joinedAt: string | null; isAdmin: boolean; privacy?: React.ReactNode }) {
  const t = useT()
  const locale = useLocale()
  return (
    <div className="space-y-4">
      <section className="card divide-y divide-n-eee">
        <div className="p-4 flex items-start gap-3">
          <Mail className="w-5 h-5 text-n-666 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-n-333">{t('로그인 이메일')}</div>
            <div className="text-sm text-n-666 truncate">{email || t('(이메일 비공개)')}</div>
            <p className="text-xs text-n-888 mt-1">{t('본인만 확인할 수 있고 피드·게시물에 노출되지 않아요.')}</p>
          </div>
        </div>
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

      {privacy}
    </div>
  )
}
