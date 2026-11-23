import { sb, useMockData as isMock } from './client'
import { sortBadges, type BadgeId, type MemberBadge } from '@/lib/badges'

/** E1: a member's badges (awarded by the database, readable by every member). */
export async function listMemberBadges(memberId: string): Promise<MemberBadge[]> {
  if (isMock()) {
    const now = new Date().toISOString()
    const mock: Array<[BadgeId, number, number]> =
      memberId === 'dev-user-id'
        ? [['founder', 1, 7], ['first_post', 1, 4], ['liked', 2, 37], ['gallery', 1, 2], ['inviter', 1, 1], ['streak', 1, 4], ['agent', 1, 2]]
        : [['first_post', 1, 1]]
    return sortBadges(mock.map(([badge, tier, value]) => ({ badge, tier, value, awardedAt: now, updatedAt: now })))
  }
  const supabase = await sb()
  const { data, error } = await supabase
    .from('member_badges')
    .select('badge, tier, value, awarded_at, updated_at')
    .eq('member_id', memberId)
  if (error) throw error
  return sortBadges(
    ((data || []) as Array<{ badge: BadgeId; tier: number; value: number; awarded_at: string; updated_at: string }>).map((r) => ({
      badge: r.badge,
      tier: r.tier,
      value: r.value,
      awardedAt: r.awarded_at,
      updatedAt: r.updated_at,
    })),
  )
}

/** One row per Seoul day (streak badge). */
export async function recordVisit(): Promise<void> {
  if (isMock()) return
  const supabase = await sb()
  await supabase.rpc('badges_visit')
}
