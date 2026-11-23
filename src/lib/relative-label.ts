import { formatDistanceToNow } from 'date-fns'
import { enUS, ko, type Locale as DateLocale } from 'date-fns/locale'
import type { Locale } from '@/i18n/config'

const DATE_LOCALES: Record<Locale, DateLocale> = { ko, en: enUS }

/** '3분 전' / '3 minutes ago'. Pure, so server code (server actions included) can print it without a client component. */
export function relativeLabel(date: string | Date, locale: Locale, addSuffix = true): string {
  return formatDistanceToNow(new Date(date), { addSuffix, locale: DATE_LOCALES[locale] })
}
