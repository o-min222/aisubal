import {
  MOCK_ACTIVE_MEMBER_COUNT,
  MOCK_MEMBERS,
  MOCK_SITE_SETTINGS,
} from '@/lib/mock-data'
import type { Member, SiteSettings } from '@/lib/supabase/types'
import { DEV_NICKNAME_UNLOCK_THRESHOLD, isNicknameUnlocked } from '@/lib/profile'
import { sb, useMockData } from './client'
import { MEMBER_PUBLIC_COLUMNS } from './member-columns'

function asMember(row: Record<string, unknown> | null): Member | null {
  if (!row) return null
  return { email: '', ...row } as Member
}

export async function listMembers(): Promise<Member[]> {
  if (useMockData()) return MOCK_MEMBERS

  const supabase = await sb()
  const { data, error } = await supabase
    .from('members')
    .select(MEMBER_PUBLIC_COLUMNS)
    .not('signup_completed_at', 'is', null)
    .eq('is_banned', false)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data || []).map((r) => asMember(r as Record<string, unknown>)!) 
}

export async function getMemberById(id: string): Promise<Member | null> {
  if (useMockData()) {
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

export async function countActiveMembers(): Promise<number> {
  if (useMockData()) return MOCK_ACTIVE_MEMBER_COUNT

  const supabase = await sb()
  const { data, error } = await supabase.rpc('count_active_members')
  if (error) throw error
  return typeof data === 'number' ? data : Number(data) || 0
}

export async function getSiteSettings(): Promise<SiteSettings> {
  if (useMockData()) return MOCK_SITE_SETTINGS

  const supabase = await sb()
  const { data, error } = await supabase.rpc('get_site_config')
  if (error) {
    // Fallback: read site_config rows directly
    const { data: rows, error: rowErr } = await supabase.from('site_config').select('key, value')
    if (rowErr) throw rowErr
    const map = Object.fromEntries((rows || []).map((r: { key: string; value: string }) => [r.key, r.value]))
    return {
      nickname_unlock_threshold: Number(map.nickname_unlock_threshold) || 100,
      site_name: map.site_name || 'AI쓰발',
      invites_per_member: Number(map.invites_per_member) || 2,
    }
  }

  const cfg = (data || {}) as Record<string, string>
  return {
    nickname_unlock_threshold: Number(cfg.nickname_unlock_threshold) || 100,
    site_name: cfg.site_name || 'AI쓰발',
    invites_per_member: Number(cfg.invites_per_member) || 2,
  }
}

export async function getNicknameUnlockFromConfig(activeCount?: number) {
  if (useMockData()) {
    const count = activeCount ?? MOCK_ACTIVE_MEMBER_COUNT
    const threshold = DEV_NICKNAME_UNLOCK_THRESHOLD
    return {
      unlocked: isNicknameUnlocked(count, threshold),
      threshold,
      activeCount: count,
    }
  }

  const [settings, count] = await Promise.all([
    getSiteSettings(),
    activeCount !== undefined ? Promise.resolve(activeCount) : countActiveMembers(),
  ])
  const threshold = settings.nickname_unlock_threshold
  return {
    unlocked: isNicknameUnlocked(count, threshold),
    threshold,
    activeCount: count,
  }
}
