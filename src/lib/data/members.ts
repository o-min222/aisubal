import { INVITES_PER_MEMBER } from '@/lib/invite-rules'
import {
  MOCK_ACTIVE_MEMBER_COUNT,
  MOCK_MEMBERS,
  MOCK_SITE_SETTINGS,
} from '@/lib/mock-data'
import type { Member, SiteSettings } from '@/lib/supabase/types'
import { isAnonUnlocked } from '@/lib/profile'
import { sb, isMock } from './client'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'

function asMember(row: Record<string, unknown> | null): Member | null {
  if (!row) return null
  return { email: '', ...row } as Member
}


export async function getMemberById(id: string): Promise<Member | null> {
  if (isMock()) {
    return MOCK_MEMBERS.find((m) => m.id === id) ?? null
  }

  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_PUBLIC_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return asMember(data as Record<string, unknown> | null)
}

async function countActiveMembers(): Promise<number> {
  if (isMock()) return MOCK_ACTIVE_MEMBER_COUNT

  const supabase = await sb()
  const { data, error } = await supabase.rpc('count_active_members')
  if (error) throw error
  return typeof data === 'number' ? data : Number(data) || 0
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (isMock()) return MOCK_SITE_SETTINGS

  const supabase = await sb()
  const { data, error } = await supabase.rpc('get_site_config')
  if (error) {
    // Fallback: read site_config rows directly
    const { data: rows, error: rowErr } = await supabase.from('site_config').select('key, value')
    if (rowErr) throw rowErr
    const map = Object.fromEntries((rows || []).map((r: { key: string; value: string }) => [r.key, r.value]))
    return {
      anon_unlock_threshold: Number(map.anon_unlock_threshold) || 100,
      site_name: map.site_name || 'AI쓰발',
      invites_per_member: Number(map.invites_per_member) || INVITES_PER_MEMBER,
    }
  }

  const cfg = (data || {}) as Record<string, string>
  return {
    anon_unlock_threshold: Number(cfg.anon_unlock_threshold) || 100,
    site_name: cfg.site_name || 'AI쓰발',
    invites_per_member: Number(cfg.invites_per_member) || INVITES_PER_MEMBER,
  }
}

export async function getAnonUnlockFromConfig(activeCount?: number) {
  if (isMock()) {
    const count = activeCount ?? MOCK_ACTIVE_MEMBER_COUNT
    // dev: MOCK_SITE_SETTINGS is editable from 관리 › 사이트 (A42), so both states are reviewable
    const threshold = MOCK_SITE_SETTINGS.anon_unlock_threshold
    return {
      unlocked: isAnonUnlocked(count, threshold),
      threshold,
      activeCount: count,
    }
  }

  const [settings, count] = await Promise.all([
    getSiteSettings(),
    activeCount !== undefined ? Promise.resolve(activeCount) : countActiveMembers(),
  ])
  const threshold = settings.anon_unlock_threshold
  return {
    unlocked: isAnonUnlocked(count, threshold),
    threshold,
    activeCount: count,
  }
}

/** Resolve a unique @handle to a member id (mentions resolve to handles only). */
async function getMemberIdByHandle(handle: string): Promise<string | null> {
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return null
  if (isMock()) {
    if (handle === 'dev') return 'dev-user-id'
    return MOCK_MEMBERS.find((m) => m.handle === handle)?.id ?? null
  }
  const supabase = await sb()
  const { data } = await supabase.from('members').select('id').eq('handle', handle).not('signup_completed_at', 'is', null).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

/** Current handle first; else an old handle during its 14-day hold (or released but unclaimed). */
export async function resolveHandle(handle: string): Promise<string | null> {
  if (!/^[a-z0-9_]{3,20}$/.test(handle)) return null
  const id = await getMemberIdByHandle(handle).catch(() => null)
  if (id) return id
  const { memberIdByOldHandle } = await import('./profile')
  return memberIdByOldHandle(handle).catch(() => null)
}
