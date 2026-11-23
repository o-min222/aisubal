/**
 * A53: the owner's 모임 as calendar data. One shape (`MineMeetup`, from the
 * 0101 `moim__mine` RPC) feeds the private ICS feed, the per-모임 .ics, the
 * agent's my_meetups / heartbeat, and the CLI. Pure: no I/O here.
 */
import type { Moim, MoimDetail } from '@/lib/data/moim'

export type MyMoimRole = 'host' | 'confirmed' | 'pending' | 'waitlisted' | 'invited' | null
export type MoimChange = { fields: string[]; at: string }
export type MineMeetup = {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  timeTbd: boolean
  mode: 'offline' | 'online'
  venueName: string | null
  meetupStatus: 'open' | 'closed' | 'cancelled' | 'past'
  my: MyMoimRole
  url: string
  updatedAt?: string | null
  changes?: MoimChange[]
  sequence?: number
  /** host / confirmed seat only (same rule as the web) */
  private?: { venueAddress: string | null; mapUrl: string | null; meetingUrl: string | null } | null
}
export type MeetupEvent = { type: 'invited' | 'confirmed' | 'changed' | 'cancelled'; meetupId: string; at: string; fields?: string[] }
export type MeetupReminder = { meetupId: string; title: string; startsAt: string; when: 'today' | 'tomorrow' }
export type MyMeetupsRaw = { now: string; since: string; meetups: MineMeetup[]; events: MeetupEvent[]; reminders: MeetupReminder[] }

/** A 모임 as the signed-in viewer sees it (web data → calendar shape). */
export function moimToMine(m: Moim | MoimDetail): MineMeetup {
  const role: MyMoimRole = m.isHost ? 'host' : m.myRsvp && ['confirmed', 'pending', 'waitlisted'].includes(m.myRsvp.status) ? (m.myRsvp.status as MyMoimRole) : null
  return {
    id: m.id,
    title: m.title,
    startsAt: m.startsAt,
    endsAt: m.endsAt,
    timeTbd: m.timeTbd,
    mode: m.mode,
    venueName: m.venueName,
    meetupStatus: m.status,
    my: role,
    url: `/moim/${m.id}`,
    private: 'private' in m ? m.private : null,
  }
}

export type CalLang = 'ko' | 'en'
const L = {
  ko: { cal: 'AI쓰발 모임', tbd: '시간 미정', pending: '승인 대기', waitlisted: '대기', invited: '초대됨', cancelled: '취소됨', host: '내가 여는 모임', confirmed: '참석 확정', open: '모임 페이지', online: '온라인', map: '지도' },
  en: { cal: 'AI쓰발 meetups', tbd: 'time TBD', pending: 'awaiting approval', waitlisted: 'waitlist', invited: 'invited', cancelled: 'cancelled', host: 'You host this', confirmed: 'Confirmed', open: 'Meetup page', online: 'Online', map: 'Map' },
} as const

export const KST = 'Asia/Seoul'
/** Absolute links in agent output when no request origin is at hand. */
export const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || 'https://aisubal.vercel.app'
const DAY = 86_400_000
const HOUR = 3_600_000

/** 20261124T101500Z */
export function icsUtc(iso: string | number | Date): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}
/** KST calendar date as YYYYMMDD (all-day events for "time TBD"). */
export function kstDate(iso: string, plusDays = 0): string {
  const d = new Date(new Date(iso).getTime() + 9 * HOUR + plusDays * DAY)
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
/** RFC 5545 §3.1: lines ≤ 75 octets, continuation lines start with one space. Never splits a UTF-8 character. */
export function icsFold(line: string): string {
  const enc = new TextEncoder()
  if (enc.encode(line).length <= 75) return line
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const b = enc.encode(ch).length
    const limit = out.length === 0 ? 75 : 74
    if (bytes + b > limit) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += b
  }
  out.push(cur)
  return out.join('\r\n ')
}

function roleLabel(m: MineMeetup, lang: CalLang): string | null {
  const t = L[lang]
  if (m.meetupStatus === 'cancelled') return t.cancelled
  if (m.my === 'pending') return t.pending
  if (m.my === 'waitlisted') return t.waitlisted
  if (m.my === 'invited') return t.invited
  return null
}

export function summaryOf(m: MineMeetup, lang: CalLang = 'ko'): string {
  const tags = [roleLabel(m, lang), m.timeTbd ? L[lang].tbd : null].filter(Boolean)
  return tags.length ? `${m.title} (${tags.join(' · ')})` : m.title
}

export function locationOf(m: MineMeetup, lang: CalLang = 'ko'): string | null {
  if (m.mode === 'online') return m.private?.meetingUrl || m.venueName || L[lang].online
  const parts = [m.venueName, m.private?.venueAddress].filter((x): x is string => Boolean(x && x.trim()))
  return parts.length ? [...new Set(parts)].join(' · ') : null
}

function eventLines(m: MineMeetup, origin: string, lang: CalLang, stamp: string): string[] {
  const t = L[lang]
  const url = new URL(m.url, origin).toString()
  const lines = ['BEGIN:VEVENT', `UID:${m.id}@aisubal`, `DTSTAMP:${stamp}`, `SEQUENCE:${m.sequence ?? 0}`]
  if (m.updatedAt) lines.push(`LAST-MODIFIED:${icsUtc(m.updatedAt)}`)
  if (m.timeTbd) {
    lines.push(`DTSTART;VALUE=DATE:${kstDate(m.startsAt)}`, `DTEND;VALUE=DATE:${kstDate(m.startsAt, 1)}`)
  } else {
    const start = new Date(m.startsAt).getTime()
    const end = m.endsAt && new Date(m.endsAt).getTime() > start ? new Date(m.endsAt).getTime() : start + 2 * HOUR
    lines.push(`DTSTART:${icsUtc(start)}`, `DTEND:${icsUtc(end)}`)
  }
  lines.push(`SUMMARY:${icsEscape(summaryOf(m, lang))}`)
  const loc = locationOf(m, lang)
  if (loc) lines.push(`LOCATION:${icsEscape(loc)}`)
  const desc = [
    m.my === 'host' ? t.host : m.my === 'confirmed' ? t.confirmed : roleLabel(m, lang),
    `${t.open}: ${url}`,
    m.private?.meetingUrl && m.mode === 'online' ? `${t.online}: ${m.private.meetingUrl}` : null,
    m.private?.mapUrl ? `${t.map}: ${m.private.mapUrl}` : null,
  ].filter(Boolean).join('\n')
  lines.push(`DESCRIPTION:${icsEscape(desc)}`, `URL:${url}`)
  lines.push(`STATUS:${m.meetupStatus === 'cancelled' ? 'CANCELLED' : m.my === 'host' || m.my === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}`)
  lines.push('END:VEVENT')
  return lines
}

/** A VCALENDAR for one or many 모임. `feed` adds the refresh hints calendar apps use for subscriptions. */
export function buildIcs(list: MineMeetup[], opts: { origin: string; lang?: CalLang; feed?: boolean; now?: Date }): string {
  const lang = opts.lang ?? 'ko'
  const stamp = icsUtc(opts.now ?? new Date())
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//AI쓰발//moim//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']
  if (opts.feed) lines.push(`X-WR-CALNAME:${icsEscape(L[lang].cal)}`, `X-WR-TIMEZONE:${KST}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H')
  for (const m of list) lines.push(...eventLines(m, opts.origin, lang, stamp))
  lines.push('END:VCALENDAR')
  return lines.map(icsFold).join('\r\n') + '\r\n'
}

/** Google Calendar "add event" link (no account data leaves the browser except what the user sees). */
export function googleCalendarUrl(m: MineMeetup, origin: string, lang: CalLang = 'ko'): string {
  const start = new Date(m.startsAt).getTime()
  const end = m.endsAt && new Date(m.endsAt).getTime() > start ? new Date(m.endsAt).getTime() : start + 2 * HOUR
  const dates = m.timeTbd ? `${kstDate(m.startsAt)}/${kstDate(m.startsAt, 1)}` : `${icsUtc(start)}/${icsUtc(end)}`
  const q = new URLSearchParams({ action: 'TEMPLATE', text: summaryOf(m, lang), dates, details: new URL(m.url, origin).toString(), ctz: KST })
  const loc = locationOf(m, lang)
  if (loc) q.set('location', loc)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

export function icsFilename(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 60) || 'moim'
  return `${base}.ics`
}

/** "11월 26일 (목) 19:00" in KST — for agent text. */
export function kstWhen(iso: string, timeTbd = false): string {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('ko-KR', { timeZone: KST, month: 'long', day: 'numeric', weekday: 'short' }).format(d)
  if (timeTbd) return `${date} (시간 미정)`
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: KST, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date} ${time} KST`
}

// ------------------------------------------------------------------ agent view (my_meetups / heartbeat)
const untrusted = (text: string | null | undefined) => ({ trust: 'untrusted' as const, untrusted_text: text ?? '' })

export const MEETUP_AGENT_RULES =
  'Read + remind only: you may tell your owner about invites, confirmations, time/place changes and upcoming 모임, and help them add them to a calendar. You cannot apply, cancel, or RSVP; the owner does that on the web.'

export function shapeMyMeetups(raw: MyMeetupsRaw, origin: string) {
  const byId = new Map(raw.meetups.map((m) => [m.id, m]))
  return {
    rules: MEETUP_AGENT_RULES,
    since: raw.since,
    checkedAt: raw.now,
    meetups: raw.meetups.map((m) => ({
      id: m.id,
      title: untrusted(m.title),
      when: kstWhen(m.startsAt, m.timeTbd),
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      timeTbd: m.timeTbd,
      mode: m.mode,
      place: untrusted(m.mode === 'online' ? '온라인' : m.venueName),
      myStatus: m.my,
      meetupStatus: m.meetupStatus,
      url: new URL(m.url, origin).toString(),
      ics: new URL(`/api/moim/${m.id}/ics`, origin).toString(),
      recentChanges: m.changes ?? [],
    })),
    events: raw.events.map((e) => ({ ...e, title: untrusted(byId.get(e.meetupId)?.title ?? null), url: new URL(`/moim/${e.meetupId}`, origin).toString() })),
    reminders: raw.reminders.map((r) => ({ ...r, title: untrusted(r.title), whenText: kstWhen(r.startsAt) })),
    calendar: {
      perMeetup: 'Each 모임 has an .ics link (opens with the owner signed in).',
      feed: 'The owner can create a private, revocable calendar subscription on any 모임 page (캘린더 → 내 모임 캘린더 구독). Never ask for or store that link.',
    },
  }
}

export type MeetupSuggestion = { action: 'remind'; why: string; args?: Record<string, unknown> }

/** Plain "tell your owner" nudges; titles are member-written, so they're quoted, never executed. */
export function suggestMeetupActions(raw: MyMeetupsRaw): MeetupSuggestion[] {
  const out: MeetupSuggestion[] = []
  const byId = new Map(raw.meetups.map((m) => [m.id, m]))
  const q = (id: string) => `“${(byId.get(id)?.title ?? '모임').slice(0, 60)}”`
  for (const r of raw.reminders.slice(0, 3)) {
    const m = byId.get(r.meetupId)
    const where = m?.mode === 'online' ? ' (online)' : m?.venueName ? ` at ${m.venueName.slice(0, 40)}` : ''
    out.push({ action: 'remind', args: { meetupId: r.meetupId }, why: `Remind your owner: ${q(r.meetupId)} is ${r.when} — ${kstWhen(r.startsAt)}${where}.` })
  }
  for (const e of raw.events.slice(-5)) {
    if (e.type === 'invited') out.push({ action: 'remind', args: { meetupId: e.meetupId }, why: `Your owner was invited to ${q(e.meetupId)}. Tell them; they apply on the web.` })
    else if (e.type === 'confirmed') out.push({ action: 'remind', args: { meetupId: e.meetupId }, why: `Your owner's seat at ${q(e.meetupId)} is confirmed. Offer to add it to their calendar (.ics).` })
    else if (e.type === 'cancelled') out.push({ action: 'remind', args: { meetupId: e.meetupId }, why: `${q(e.meetupId)} was cancelled. Let your owner know.` })
    else out.push({ action: 'remind', args: { meetupId: e.meetupId }, why: `${q(e.meetupId)} changed (${(e.fields ?? []).join(', ') || 'details'}). Let your owner know.` })
  }
  return out
}
