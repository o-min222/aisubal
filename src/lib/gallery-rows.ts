import { msg } from '@/i18n/translate'

/**
 * A84: Product Hunt-style gallery list rules (pure). Latest sort groups rows by when they were added,
 * in KST: 오늘 / 이번 주 (since Monday) / 이번 달 / 그 전.
 */
export type DateBucket = 'today' | 'week' | 'month' | 'earlier'

export const DATE_BUCKET_LABEL: Record<DateBucket, string> = {
  today: msg('오늘'),
  week: msg('이번 주'),
  month: msg('이번 달'),
  earlier: msg('그 전'),
}

const KST = 9 * 3600_000
const kstDay = (t: number) => Math.floor((t + KST) / 86400_000)

export function dateBucket(iso: string, now: Date = new Date()): DateBucket {
  const t = new Date(iso).getTime()
  const n = now.getTime()
  const day = kstDay(t)
  const today = kstDay(n)
  if (day >= today) return 'today'
  // KST weekday of today, Monday = 0
  const dow = (new Date(today * 86400_000).getUTCDay() + 6) % 7
  if (day >= today - dow) return 'week'
  const a = new Date(t + KST)
  const b = new Date(n + KST)
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) return 'month'
  return 'earlier'
}

/** the group header to show before row i (null = same group as the row before it) */
export function groupHeaderAt(createdAt: string[], i: number, prevCreatedAt: string | null, now: Date = new Date()): DateBucket | null {
  const cur = dateBucket(createdAt[i], now)
  const prev = i > 0 ? createdAt[i - 1] : prevCreatedAt
  return prev && dateBucket(prev, now) === cur ? null : cur
}
