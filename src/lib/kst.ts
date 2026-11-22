/** Display helpers: every 모임 time is shown in Korea time (KST). */
const TZ = 'Asia/Seoul'

export function kstDateTime(iso: string, intl = 'ko-KR') {
  return new Intl.DateTimeFormat(intl, { month: 'long', day: 'numeric', weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(iso))
}
export function kstTime(iso: string, intl = 'ko-KR') {
  return new Intl.DateTimeFormat(intl, { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(new Date(iso))
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
