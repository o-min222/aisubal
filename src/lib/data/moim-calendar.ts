import { randomBytes } from 'node:crypto'
import { createAnonClient } from '@/lib/supabase/anon'
import { DEV_ID } from '@/lib/mock-social'
import { moimToMine, type MeetupReminder, type MineMeetup, type MyMeetupsRaw } from '@/lib/moim-calendar'
import { getMoim, listMoim } from './moim'
import { isMock, sb } from './client'

/**
 * A53 calendar data: the per-모임 .ics (session), the member's private feed
 * token (0101 moim_ics_feed_*; only the hash is stored), and the feed itself
 * (anon, token = the only credential).
 */
type IcsFeedStatus = { enabled: boolean; prefix?: string; createdAt?: string; lastFetchedAt?: string | null }

/** One 모임 as the signed-in viewer sees it (private place only if the web shows it to them). */
export async function moimForIcs(viewerId: string, id: string): Promise<MineMeetup | null> {
  const m = await getMoim(viewerId, id)
  return m ? moimToMine(m) : null
}

const g = globalThis as unknown as { __aisubalIcsFeed?: { token: string; createdAt: string; lastFetchedAt: string | null } | null }

export async function icsFeedStatus(): Promise<IcsFeedStatus> {
  if (isMock()) {
    const f = g.__aisubalIcsFeed
    return f ? { enabled: true, prefix: f.token.slice(0, 10), createdAt: f.createdAt, lastFetchedAt: f.lastFetchedAt } : { enabled: false }
  }
  const { data, error } = await (await sb()).rpc('moim_ics_feed_status')
  if (error) throw new Error(error.message)
  return data as IcsFeedStatus
}

/** New link (the old one stops working). The raw token is returned once and never stored. */
export async function rotateIcsFeed(): Promise<{ token: string; status: IcsFeedStatus }> {
  if (isMock()) {
    const token = `cal_${randomBytes(24).toString('hex')}`
    g.__aisubalIcsFeed = { token, createdAt: new Date().toISOString(), lastFetchedAt: null }
    return { token, status: await icsFeedStatus() }
  }
  const { data, error } = await (await sb()).rpc('moim_ics_feed_rotate')
  if (error) throw new Error(error.message)
  return data as { token: string; status: IcsFeedStatus }
}

export async function revokeIcsFeed(): Promise<IcsFeedStatus> {
  if (isMock()) {
    g.__aisubalIcsFeed = null
    return { enabled: false }
  }
  const { data, error } = await (await sb()).rpc('moim_ics_feed_revoke')
  if (error) throw new Error(error.message)
  return data as IcsFeedStatus
}

/** Calendar app fetch. null = unknown / revoked token (the route answers 404 either way). */
export async function icsFeedByToken(token: string): Promise<MineMeetup[] | null> {
  if (!/^cal_[0-9a-f]{48}$/.test(token)) return null
  if (isMock()) {
    const f = g.__aisubalIcsFeed
    if (!f || f.token !== token) return null
    f.lastFetchedAt = new Date().toISOString()
    return (await mockMine(DEV_ID)).meetups
  }
  const { data, error } = await createAnonClient().rpc('moim_ics_feed', { p_token: token })
  if (error || !data) return null
  return ((data as { meetups?: MineMeetup[] }).meetups ?? []) as MineMeetup[]
}

/** DEV mock for mcp_my_meetups: the viewer's upcoming 모임 + reminders for today / tomorrow (KST). */
export async function mockMine(viewerId: string): Promise<MyMeetupsRaw> {
  const list = await listMoim(viewerId, 'upcoming')
  const mine: MineMeetup[] = []
  for (const m of list) {
    const row = moimToMine(m)
    if (!row.my) continue
    const d = await getMoim(viewerId, m.id)
    mine.push({ ...row, private: d && (row.my === 'host' || row.my === 'confirmed') ? d.private : null })
  }
  const kstDay = (iso: string | number) => new Date(new Date(iso).getTime() + 9 * 3_600_000).toISOString().slice(0, 10)
  const today = kstDay(Date.now())
  const tomorrow = kstDay(Date.now() + 86_400_000)
  const reminders: MeetupReminder[] = mine
    .filter((m) => (m.my === 'host' || m.my === 'confirmed') && !m.timeTbd && [today, tomorrow].includes(kstDay(m.startsAt)))
    .map((m) => ({ meetupId: m.id, title: m.title, startsAt: m.startsAt, when: kstDay(m.startsAt) === today ? 'today' : 'tomorrow' }))
  const now = new Date().toISOString()
  return { now, since: new Date(Date.now() - 7 * 86_400_000).toISOString(), meetups: mine, events: [], reminders }
}
