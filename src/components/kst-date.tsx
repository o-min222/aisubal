'use client'

import { useLocale } from '@/i18n/client'
import { LOCALE_META } from '@/i18n/config'
import { kstDateTime, kstDayBadge, kstShortDate, kstTime } from '@/lib/kst'

/** A 모임 time in Korea time, formatted for the UI language (usable from server components). */
export function KstDate({ iso, part = 'dateTime' }: { iso: string; part?: 'dateTime' | 'time' | 'short' | 'month' | 'day' | 'weekday' }) {
  const intl = LOCALE_META[useLocale()].intl
  if (part === 'dateTime') return kstDateTime(iso, intl)
  if (part === 'time') return kstTime(iso, intl)
  if (part === 'short') return kstShortDate(iso, intl)
  return kstDayBadge(iso, intl)[part]
}
