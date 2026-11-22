'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Globe } from 'lucide-react'
import { LOCALES, LOCALE_META, type Locale } from '@/i18n/config'
import { useLocale, useT } from '@/i18n/client'

/**
 * Language switcher. Sets the cookie (and the member's profile when signed in),
 * then refreshes server components in place — the URL never changes.
 * `row`: account menu · `inline`: logged-out landing / login · `block`: settings.
 */
export function LocaleSwitch({ variant = 'inline' }: { variant?: 'row' | 'inline' | 'block' }) {
  const current = useLocale()
  const t = useT()
  const router = useRouter()
  const [pending, start] = useTransition()
  const [busy, setBusy] = useState<Locale | null>(null)

  async function pick(l: Locale) {
    if (l === current || busy) return
    setBusy(l)
    try {
      await fetch('/api/locale', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale: l }) })
      document.documentElement.lang = LOCALE_META[l].htmlLang
      start(() => router.refresh())
    } finally {
      setBusy(null)
    }
  }

  const buttons = (
    <div className="locale-seg" role="radiogroup" aria-label={t('언어')}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={l === current}
          lang={LOCALE_META[l].htmlLang}
          className={l === current ? 'on' : ''}
          disabled={pending || busy !== null}
          onClick={() => pick(l)}
        >
          {LOCALE_META[l].native}
        </button>
      ))}
    </div>
  )

  if (variant === 'row') {
    return (
      <div className="account-row locale-row">
        <Globe className="w-[18px] h-[18px]" aria-hidden /> <span className="flex-1">{t('언어')}</span>
        {buttons}
      </div>
    )
  }
  if (variant === 'block') {
    return (
      <div className="locale-block">
        {buttons}
        <p className="text-xs text-[#888] mt-2">
          {t('메뉴와 버튼 같은 화면 글자만 바뀌어요. 멤버가 쓴 글은 쓴 언어 그대로 보여요.')}
        </p>
      </div>
    )
  }
  return (
    <div className="locale-inline">
      <Globe className="w-3.5 h-3.5" aria-hidden />
      {buttons}
    </div>
  )
}
