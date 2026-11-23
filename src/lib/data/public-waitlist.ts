import { sb, isMock } from './client'

/** A57: the public waitlist (0108). Inserts only via waitlist_join; admins invite by issuing a code. */
export type WaitlistStatus = 'waiting' | 'invited' | 'dismissed'
export type WaitlistEntry = {
  id: string
  email: string
  reason: string | null
  source: string | null
  locale: string | null
  status: WaitlistStatus
  code: string | null
  used: boolean
  created_at: string
  invited_at: string | null
}

type Mock = { rows: WaitlistEntry[] }
function mock(): Mock {
  const g = globalThis as unknown as { __aisubalJoin?: Mock }
  g.__aisubalJoin ??= {
    rows: [
      { id: 'w1', email: 'mina@example.com', reason: 'Claude Code로 사내 툴을 만들고 있어요. 다른 분들 워크플로가 궁금해요.', source: 'teaser', locale: 'ko', status: 'waiting', code: null, used: false, created_at: new Date(Date.now() - 3600e3).toISOString(), invited_at: null },
      { id: 'w2', email: 'jun.dev@example.com', reason: null, source: null, locale: 'en', status: 'waiting', code: null, used: false, created_at: new Date(Date.now() - 86400e3).toISOString(), invited_at: null },
      { id: 'w3', email: 'sora@example.com', reason: '친구 추천으로 왔어요', source: 'teaser', locale: 'ko', status: 'invited', code: 'K7QX2M9P', used: false, created_at: new Date(Date.now() - 2 * 86400e3).toISOString(), invited_at: new Date(Date.now() - 86400e3).toISOString() },
    ],
  }
  return g.__aisubalJoin
}

export class JoinError extends Error {}

export async function joinWaitlist(input: { email: string; reason?: string | null; source?: string | null; locale?: string | null; client?: string | null }): Promise<{ waiting: number }> {
  if (isMock()) {
    const st = mock()
    const email = input.email.trim().toLowerCase()
    if (!st.rows.some((r) => r.email === email)) {
      st.rows.unshift({ id: `w${Date.now()}`, email, reason: input.reason?.trim() || null, source: input.source ?? null, locale: input.locale ?? null, status: 'waiting', code: null, used: false, created_at: new Date().toISOString(), invited_at: null })
    }
    return { waiting: await waitlistCount() }
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('waitlist_join', {
    p_email: input.email, p_reason: input.reason ?? null, p_source: input.source ?? null, p_locale: input.locale ?? null, p_client: input.client ?? null,
  })
  if (error) throw new JoinError(error.message)
  return { waiting: Number((data as { waiting?: number } | null)?.waiting ?? 0) }
}

export async function waitlistCount(): Promise<number> {
  if (isMock()) return mock().rows.filter((r) => r.status === 'waiting').length
  const supabase = await sb()
  const { data, error } = await supabase.rpc('waitlist_count')
  if (error) throw error
  return Number(data ?? 0)
}

export async function adminListWaitlist(status: WaitlistStatus | 'all'): Promise<WaitlistEntry[]> {
  if (isMock()) return mock().rows.filter((r) => status === 'all' || r.status === status)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('waitlist_admin', { p_status: status })
  if (error) throw error
  return (data as WaitlistEntry[]) ?? []
}

/** issue (or return the already issued) invite code; nothing is sent */
export async function adminInviteFromWaitlist(id: string): Promise<string> {
  if (isMock()) {
    const r = mock().rows.find((x) => x.id === id)
    if (!r) throw new JoinError('not_found')
    if (!r.code) Object.assign(r, { code: Math.random().toString(36).slice(2, 10).toUpperCase(), status: 'invited', invited_at: new Date().toISOString() })
    return r.code as string
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('waitlist_invite', { p_id: id })
  if (error) throw new JoinError(error.message)
  return data as string
}

export async function adminSetWaitlistStatus(id: string, status: 'waiting' | 'dismissed'): Promise<boolean> {
  if (isMock()) {
    const r = mock().rows.find((x) => x.id === id && !x.code)
    if (r) r.status = status
    return Boolean(r)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('waitlist_set_status', { p_id: id, p_status: status })
  if (error) throw new JoinError(error.message)
  return data === true
}
