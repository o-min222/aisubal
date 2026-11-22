'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { enUS, ko, type Locale as DateLocale } from 'date-fns/locale'
import { useLocale } from '@/i18n/client'
import type { Locale } from '@/i18n/config'
import { T } from '@/i18n/t'

const DATE_LOCALES: Record<Locale, DateLocale> = { ko, en: enUS }

function format(date: string | Date, addSuffix: boolean, locale: Locale) {
  return formatDistanceToNow(new Date(date), { addSuffix, locale: DATE_LOCALES[locale] })
}

export function RelativeTime({
  date,
  addSuffix = true,
}: {
  date: string | Date
  addSuffix?: boolean
}) {
  const locale = useLocale()
  const [label, setLabel] = useState(() => format(date, addSuffix, locale))

  useEffect(() => {
    setLabel(format(date, addSuffix, locale))
  }, [date, addSuffix, locale])

  return (
    <span suppressHydrationWarning data-testid="relative-time">
      <T>{label}</T>
    </span>
  )
}
