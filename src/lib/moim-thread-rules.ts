/**
 * A29: a 모임 is a date (time optional) + 온/오프 + 지역; the rest is talked through in its comment thread.
 * Pure helpers shared by the form, the API and the DEV mock (the DB mirrors moimThreadContent in 0083).
 */
export const MAX_INVITES = 30
/** Date-only 모임 are stored at 23:59 KST, so "today, time TBD" is still upcoming all day. */
const TBD_TIME = '23:59'
const HANDLE = /^[a-z0-9_]{2,30}$/

/** Form (KST date + optional time) → the ISO the API stores, plus whether the time is still open. */
export function moimStartFromInput(date: string, time: string): { startsAt: string; timeTbd: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const t = time.trim()
  if (t && !/^\d{2}:\d{2}$/.test(t)) return null
  return { startsAt: `${date}T${t || TBD_TIME}:00+09:00`, timeTbd: !t }
}

/** Stored ISO → the form's KST date and time ('' when the time was left open). */
export function moimStartToInput(iso: string | null | undefined, timeTbd: boolean): { date: string; time: string } {
  if (!iso) return { date: '', time: '' }
  const kst = new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString()
  return { date: kst.slice(0, 10), time: timeTbd ? '' : kst.slice(11, 16) }
}

/** '@Kim', 'kim', ' kim ' → 'kim'; dropped when not a handle; deduped; capped. */
export function normalizeInvites(raw: readonly string[] | null | undefined, self?: string | null): string[] {
  const me = self?.toLowerCase() ?? null
  const out: string[] = []
  for (const r of raw ?? []) {
    const h = String(r).trim().replace(/^@+/, '').toLowerCase()
    if (!HANDLE.test(h) || h === me || out.includes(h)) continue
    out.push(h)
    if (out.length === MAX_INVITES) break
  }
  return out
}

/** The thread post's text; same shape as public.moim__thread_content (0083). */
export function moimThreadContent(m: { title: string; startsAt: string; timeTbd: boolean; mode: 'offline' | 'online'; venueName: string | null; description: string }): string {
  const { date, time } = moimStartToInput(m.startsAt, m.timeTbd)
  const [y, mo, d] = date.split('-').map(Number)
  const when = `${y}. ${mo}. ${d}.${time ? ` ${time}` : ''}`
  const where = m.mode === 'online' ? '온라인' : `오프라인${m.venueName ? ` · ${m.venueName}` : ''}`
  const desc = m.description.trim()
  return `[모임] ${m.title}\n📅 ${when} · ${where}${desc ? `\n\n${desc}` : ''}\n\n자세한 이야기는 댓글로 나눠요.`
}

/** Thread posts start with this marker; only those need a "which 모임?" lookup. */
export function isMoimThreadBody(body: string | null | undefined): boolean {
  return Boolean(body?.startsWith('[모임] '))
}

type CardSource = {
  id: string; title: string; startsAt: string; timeTbd: boolean; mode: 'offline' | 'online'; venueName: string | null
  status: string; confirmed: number; capacity: number; applyDeadline: string | null; canManage: boolean; isHost: boolean
  membersOnly: boolean; isGroupMember: boolean | null; questions: Array<{ required: boolean }>
  myRsvp: { status: string } | null; group: { name: string } | null
}
/** A30: a 모임 → its feed card. A date-only 모임 counts as ended once that (KST) day is over. */
export function toTimelineMoim(m: CardSource, invited: number, now = Date.now()) {
  const ended = m.status === 'past' || m.status === 'cancelled' || Date.parse(m.startsAt) < now
  const deadlineOk = !m.applyDeadline || Date.parse(m.applyDeadline) > now
  // a cancelled application is no application: they may apply again (applyBlock only stops 'rejected')
  const rsvp = m.myRsvp && m.myRsvp.status !== 'cancelled' ? m.myRsvp.status : null
  const canJoin =
    !ended && m.status === 'open' && deadlineOk && !m.canManage && !m.isHost && !rsvp &&
    !m.questions.some((q) => q.required) && !(m.membersOnly && !m.isGroupMember)
  return {
    id: m.id, title: m.title, startsAt: m.startsAt, timeTbd: m.timeTbd, mode: m.mode, venueName: m.venueName,
    confirmed: m.confirmed, capacity: m.capacity, invited,
    myRsvp: rsvp as 'pending' | 'confirmed' | 'waitlisted' | 'rejected' | 'cancelled' | null,
    canManage: m.canManage, canJoin, ended, cancelled: m.status === 'cancelled', groupName: m.group?.name ?? null,
  }
}

/**
 * A30 추천: an upcoming 모임 gets a small lift that grows as the day nears (≤7 days), and its
 * age decay is capped (a 모임 posted last week for tomorrow is still news). Ended → nothing.
 */
export function moimRecBoost(m: { startsAt: string; ended: boolean } | null | undefined, now = Date.now()): { boost: number; maxAgeH: number | null } {
  if (!m || m.ended) return { boost: 0, maxAgeH: null }
  const days = (Date.parse(m.startsAt) - now) / 86400_000
  if (days < 0) return { boost: 0, maxAgeH: null }
  return { boost: days <= 3 ? 1.5 : days <= 7 ? 1 : 0.5, maxAgeH: 48 }
}
