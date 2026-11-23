'use client'

import { useLocale } from '@/i18n/client'
import { relativeLabel } from '@/lib/relative-label'
import { T } from '@/i18n/t'

export function RelativeTime({
  date,
  addSuffix = true,
}: {
  date: string | Date
  addSuffix?: boolean
}) {
  const locale = useLocale()
  const label = relativeLabel(date, locale, addSuffix)

  return (
    <span suppressHydrationWarning data-testid="relative-time">
      <T>{label}</T>
    </span>
  )
}
