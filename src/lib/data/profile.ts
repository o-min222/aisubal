import type { Member } from '@/lib/supabase/types'
import { LINK_KIND_SET, MAX_LINKS, validateLink, type LinkVisibility, type ProfileLink } from '@/lib/profile-rules'
import { sb, useMockData as isMock } from './client'
import { msg } from '@/i18n/translate'
import { quotaFrom, type HandleCheckState, type HandleHistoryRow, type HandleStatus } from '@/lib/handle-policy'
import { validateHandle } from '@/lib/profile-rules'

/**
 * Self-made profile (0010): saved through profile_save / links_save RPCs.
 * Google name / email / photo live in member_private and are only a private
 * prefill for the owner; the real name is public only when opted in.
 */
export type ProfileInput = {
  handle: string
  displayName: string
  bio?: string | null
  /** 'keep' | 'none' | 'google' (explicit opt-in) | uploaded avatars-bucket URL */
  avatar: string
  showRealName: boolean
}

type MockProfile = { handle: string; displayName: string; bio: string | null; avatarUrl: string | null; showRealName: boolean; links: ProfileLink[] }
const g = globalThis as unknown as { __aisubalProfile?: Map<string, MockProfile> }
const mockStore = () => (g.__aisubalProfile ??= new Map())
const TAKEN = new Set(['kim_ai', 'lee_dev', 'park'])

export async function handleAvailable(handle: string): Promise<boolean> {
  if (isMock()) return !TAKEN.has(handle)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('profile_handle_available', { p_handle: handle })
  if (error) throw new Error(error.message)
  return Boolean(data)
}

// ---- @handle change policy (0032) ----
type MockHandleRow = HandleHistoryRow & { memberId: string }
const gh = globalThis as unknown as { __aisubalHandles?: MockHandleRow[]; __aisubalHandleNow?: Map<string, string> }
const mockHistory = () => (gh.__aisubalHandles ??= [])
const mockHandleNow = () => (gh.__aisubalHandleNow ??= new Map())
const HOLD_MS = 14 * 86_400_000

function mockStatus(member: Member, candidate?: string | null): HandleStatus {
  const current = mockHandleNow().get(member.id) ?? mockStore().get(member.id)?.handle ?? member.handle ?? null
  const now = Date.now()
  const mine = mockHistory().filter((r) => r.memberId === member.id).sort((a, b) => b.changedAt.localeCompare(a.changedAt))
  let check: HandleStatus['check'] = null
  const v = (candidate ?? '').trim().replace(/^@/, '').toLowerCase()
  if (v) {
    const hold = mockHistory().find((r) => r.old === v && Date.parse(r.releasedAt) > now)
    const state: HandleCheckState =
      v === current ? 'same'
      : !validateHandle(v).ok ? 'invalid'
      : TAKEN.has(v) || [...mockStore().entries()].some(([id, p]) => id !== member.id && p.handle === v) ? 'taken'
      : hold && hold.memberId !== member.id ? 'on_hold'
      : hold ? 'own_hold' : 'available'
    check = { handle: v, state, heldUntil: state === 'own_hold' && hold ? hold.releasedAt : null }
  }
  return { current, firstIsFree: !current, quota: quotaFrom(mine.map((r) => new Date(r.changedAt))), check, history: mine.slice(0, 10).map(({ memberId: _m, ...r }) => r) }
}

/** Quota, my own change history and (optionally) a live check of a candidate handle. */
export async function handleStatus(member: Member, candidate?: string | null): Promise<HandleStatus> {
  if (isMock()) return mockStatus(member, candidate)
  const supabase = await sb()
  const { data, error } = await supabase.rpc('profile_handle_status', { p_handle: candidate ?? null })
  if (error) throw Object.assign(new Error(error.message), { details: error.details })
  return data as HandleStatus
}

/** Change the @handle under the policy. Errors carry the DB code (+ details = next date for cooldown). */
export async function changeHandle(member: Member, handle: string): Promise<HandleStatus> {
  if (isMock()) {
    const st = mockStatus(member, handle)
    const c = st.check!
    if (c.state === 'same') return st
    if (c.state === 'invalid') throw new Error('profile_handle_invalid')
    if (c.state === 'taken') throw new Error('handle_taken')
    if (c.state === 'on_hold') throw new Error('handle_on_hold')
    if (st.current && st.quota.remaining <= 0) throw Object.assign(new Error('handle_change_cooldown'), { details: st.quota.nextAt })
    const now = new Date()
    if (st.current) {
      for (const r of mockHistory()) if (r.memberId === member.id && r.old === c.handle && Date.parse(r.releasedAt) > now.getTime()) r.releasedAt = now.toISOString()
      mockHistory().push({ memberId: member.id, old: st.current, new: c.handle, changedAt: now.toISOString(), releasedAt: new Date(now.getTime() + HOLD_MS).toISOString() })
    }
    mockHandleNow().set(member.id, c.handle)
    const cur = mockStore().get(member.id)
    if (cur) cur.handle = c.handle
    return mockStatus(member)
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('profile_change_handle', { p_handle: handle })
  if (error) throw Object.assign(new Error(error.message), { details: error.details })
  return data as HandleStatus
}

/** /u/{old}: an old handle → its member during the 14-day hold, or later while nobody has claimed it. */
export async function memberIdByOldHandle(handle: string): Promise<string | null> {
  if (isMock()) {
    const now = Date.now()
    const r = mockHistory().filter((x) => x.old === handle).sort((a, b) => b.changedAt.localeCompare(a.changedAt))[0]
    if (!r) return null
    const claimed = [...mockHandleNow().values()].includes(handle) || [...mockStore().values()].some((p) => p.handle === handle)
    return Date.parse(r.releasedAt) > now || !claimed ? r.memberId : null
  }
  const supabase = await sb()
  const { data } = await supabase.rpc('member_id_by_old_handle', { p_handle: handle })
  return (data as string | null) ?? null
}

export async function saveProfile(member: Member, input: ProfileInput): Promise<void> {
  if (isMock()) {
    if (TAKEN.has(input.handle)) throw new Error('profile_handle_taken')
    const cur = mockStore().get(member.id)
    mockStore().set(member.id, {
      handle: input.handle,
      displayName: input.displayName,
      bio: input.bio ?? null,
      avatarUrl: input.avatar === 'keep' ? cur?.avatarUrl ?? member.avatar_url : input.avatar === 'none' || input.avatar === 'google' ? null : input.avatar,
      showRealName: input.showRealName,
      links: cur?.links ?? [],
    })
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('profile_save', {
    p: { handle: input.handle, display_name: input.displayName, bio: input.bio ?? '', avatar: input.avatar, show_real_name: input.showRealName },
  })
  if (error) throw new Error(error.message)
}

export async function saveNicknameProfile(nickname: string, bio: string): Promise<void> {
  if (isMock()) return
  const supabase = await sb()
  const { error } = await supabase.rpc('profile_save_nickname', { p_nickname: nickname, p_bio: bio })
  if (error) throw new Error(error.message)
}

/** Upload to the public avatars bucket under the member's auth uid folder (storage RLS enforces it). */
export async function uploadAvatar(authId: string, file: File): Promise<string> {
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[file.type]
  if (!ext) throw new Error('avatar_type')
  if (file.size > 2 * 1024 * 1024) throw new Error('avatar_size')
  if (isMock()) return `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString('base64')}`
  const supabase = await sb()
  const path = `${authId}/${Date.now().toString(36)}.${ext}`
  const { error } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (error) throw new Error(error.message)
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}

export function cleanLinks(raw: Array<{ kind: string; url: string; visibility?: string }>): { ok: true; links: ProfileLink[] } | { ok: false; reason: string } {
  if (raw.length > MAX_LINKS) return { ok: false, reason: msg('링크는 {n}개까지예요.') }
  const out: ProfileLink[] = []
  for (const l of raw) {
    if (!l.url?.trim()) continue
    if (!LINK_KIND_SET.has(l.kind as ProfileLink['kind'])) return { ok: false, reason: msg('지원하지 않는 링크 종류예요.') }
    const v = validateLink(l.kind, l.url)
    if (!v.ok) return v
    const visibility: LinkVisibility = l.visibility === 'friends' || l.visibility === 'private' ? l.visibility : 'members'
    out.push({ kind: l.kind as ProfileLink['kind'], url: v.url, visibility })
  }
  return { ok: true, links: out }
}

export async function saveLinks(memberId: string, links: ProfileLink[]): Promise<void> {
  if (isMock()) {
    const cur = mockStore().get(memberId)
    mockStore().set(memberId, { ...(cur ?? { handle: 'dev', displayName: '개발자', bio: null, avatarUrl: null, showRealName: false }), links })
    return
  }
  const supabase = await sb()
  const { error } = await supabase.rpc('links_save', { p_links: links })
  if (error) throw new Error(error.message)
}

const MOCK_LINKS: Record<string, ProfileLink[]> = {
  'member-1': [
    { kind: 'github', url: 'https://github.com/kim-ai', visibility: 'members' },
    { kind: 'x', url: 'https://x.com/kim_ai', visibility: 'members' },
    { kind: 'linkedin', url: 'https://linkedin.com/in/kim-ai', visibility: 'friends' },
    { kind: 'blog', url: 'https://kim.ai.blog', visibility: 'members' },
  ],
  'member-2': [
    { kind: 'threads', url: 'https://threads.net/@lee.dev', visibility: 'members' },
    { kind: 'youtube', url: 'https://youtube.com/@leedev', visibility: 'members' },
  ],
}

/** Links the viewer may see (owner: all; members: 'members'; friends also 'friends'). */
export async function getProfileLinks(viewerId: string, memberId: string, isFriend = false): Promise<ProfileLink[]> {
  if (isMock()) {
    const own = viewerId === memberId || (viewerId === 'dev-user-id' && memberId === 'dev-user-id')
    const all = mockStore().get(memberId)?.links ?? MOCK_LINKS[memberId] ?? (memberId === 'dev-user-id' ? [
      { kind: 'github', url: 'https://github.com/dev', visibility: 'members' },
      { kind: 'instagram', url: 'https://instagram.com/dev', visibility: 'friends' },
      { kind: 'website', url: 'https://dev.example.com', visibility: 'private' },
    ] as ProfileLink[] : [])
    return all.filter((l: ProfileLink) => own || l.visibility === 'members' || (l.visibility === 'friends' && isFriend))
  }
  const supabase = await sb()
  const { data, error } = await supabase.rpc('profile_links', { p_member: memberId })
  if (error) return []
  return ((data || []) as ProfileLink[]).filter((l) => LINK_KIND_SET.has(l.kind))
}

/** Mock overlay so DEV screenshots reflect a saved profile. */
export function mockProfileOf(memberId: string): MockProfile | null {
  return isMock() ? mockStore().get(memberId) ?? null : null
}
