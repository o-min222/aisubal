'use client'

import { SLOGAN } from '@/lib/pledge'
import { useLocale } from '@/i18n/client'

/** Brand slogan under the logo on logged-out screens. */
export function Slogan({ tone = 'dark', className = '' }: { tone?: 'dark' | 'light'; className?: string }) {
  const locale = useLocale()
  const fg = tone === 'dark' ? '#fff' : '#111'
  const sub = tone === 'dark' ? 'rgba(255,255,255,.62)' : '#666'
  // The Korean line is authored copy; other locales get its translation.
  const subText = locale === 'ko' ? SLOGAN.ko : SLOGAN.koTranslated
  return (
    <div className={`slogan text-center max-w-[420px] mx-auto ${className}`}>
      <p className="slogan-en" style={{ color: fg }}>
        {SLOGAN.en}
      </p>
      <p className="slogan-ko" style={{ color: sub }} lang={locale === 'ko' ? 'ko' : undefined}>
        {subText}
      </p>
    </div>
  )
}
