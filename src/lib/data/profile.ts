import type { Member } from '@/lib/supabase/types'
import { LINK_KIND_SET, MAX_LINKS, validateLink, type LinkVisibility, type ProfileLink } from '@/lib/profile-rules'
import { sb, useMockData as isMock } from './client'
import { msg } from '@/i18n/translate'

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
