/** Display helpers: every 모임 time is shown in Korea time (KST). */
const TZ = 'Asia/Seoul'

export function kstDateTime(iso: string, intl = 'ko-KR') {
  return new Intl.DateTimeFormat(intl, { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(iso))
}
/** Date only (time still open): '12월 3일 (목)'. */
export function kstDate(iso: string, intl = 'ko-KR') {
  return new Intl.DateTimeFormat(intl, { month: 'long', day: 'numeric', weekday: 'short', timeZone: TZ }).format(new Date(iso))
}
export function kstTime(iso: string, intl = 'ko-KR') {
  return new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(iso))
}
/** Short date for list rows: '11월 22일', with the year when it isn't this (KST) year. */
export function kstShortDate(iso: string, intl = 'ko-KR', now = new Date()) {
  const d = new Date(iso)
  const y = (x: Date) => new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: TZ }).format(x)
  return new Intl.DateTimeFormat(intl, { ...(y(d) !== y(now) && { year: 'numeric' }), month: 'short', day: 'numeric', timeZone: TZ }).format(d)
}
export function kstDayBadge(iso: string, intl = 'ko-KR') {
  const d = new Date(iso)
  return {
    month: new Intl.DateTimeFormat(intl, { month: 'short', timeZone: TZ }).format(d),
    day: new Intl.DateTimeFormat(intl, { day: 'numeric', timeZone: TZ }).format(d).replace('일', ''),
    weekday: new Intl.DateTimeFormat(intl, { weekday: 'short', timeZone: TZ }).format(d),
  }
}
/** `datetime-local` value (KST wall clock) ↔ ISO with +09:00. */
export function kstInputToIso(v: string): string {
  return v ? `${v}:00+09:00` : ''
}
export function isoToKstInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000)
  return d.toISOString().slice(0, 16)
}
