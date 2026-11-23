import { msg } from '@/i18n/translate'

/**
 * E1 contribution badges. Awarded by the database (0078 badges__award); this file only
 * names them. Thresholds must equal the latest badges__tiers() (0078, 0085 · tests/badges.test.ts).
 */
export const BADGES = [
  { id: 'founder', tiers: [1], labels: [msg('창립 멤버')], how: msg('입단 기록 {v}번째로 서약했어요') },
  { id: 'first_post', tiers: [1], labels: [msg('첫 글')], how: msg('실명 프로필로 첫 글을 올렸어요') },
  { id: 'liked', tiers: [5, 20, 50], labels: [msg('좋아요 5개 받은 글'), msg('좋아요 20개 받은 글'), msg('좋아요 50개 받은 글')], how: msg('글 하나가 좋아요 {v}개를 받았어요') },
  { id: 'gallery', tiers: [1, 3, 10], labels: [msg('첫 갤러리 등록'), msg('갤러리 기여자'), msg('갤러리 큐레이터')], how: msg('갤러리 등록 요청이 {v}개 승인됐어요') },
  { id: 'reviewer', tiers: [1, 5, 20], labels: [msg('첫 리뷰'), msg('리뷰어'), msg('열혈 리뷰어')], how: msg('갤러리 리뷰를 {v}개 남겼어요') },
  { id: 'inviter', tiers: [1, 3], labels: [msg('첫 초대 성공'), msg('초대 3명 성공')], how: msg('초대한 {v}명이 가입했어요') },
  { id: 'invite_king', tiers: [1, 2, 3, 5, 10], labels: [msg('초대왕'), msg('초대왕 2단계'), msg('초대왕 3단계'), msg('초대왕 5단계'), msg('초대왕 10단계')], how: msg('초대장을 모두 가입시켜 {v}번 다시 채웠어요') },
  { id: 'streak', tiers: [3, 7, 30], labels: [msg('3일 연속 출석'), msg('7일 연속 출석'), msg('30일 연속 출석')], how: msg('가장 길게 {v}일 연속으로 들렀어요') },
  { id: 'agent', tiers: [1], labels: [msg('AI 에이전트 연결')], how: msg('내 AI 에이전트를 AI쓰발에 연결했어요') },
] as const

export type BadgeId = (typeof BADGES)[number]['id']
export type MemberBadge = { badge: BadgeId; tier: number; value: number; awardedAt: string; updatedAt: string }

export function badgeDef(id: string) {
  return BADGES.find((b) => b.id === id) ?? null
}

/** Label for a reached tier (1-based), clamped. */
export function badgeTierLabel(id: string, tier: number): string | null {
  const d = badgeDef(id)
  if (!d) return null
  return d.labels[Math.min(Math.max(tier, 1), d.labels.length) - 1]
}

/** 'reviewer:2' (notification actor_label) → { id, tier } */
export function parseBadgeKey(key: string | null | undefined): { id: BadgeId; tier: number } | null {
  const [id, t] = String(key ?? '').split(':')
  const d = badgeDef(id)
  const tier = Number(t)
  return d && Number.isInteger(tier) && tier >= 1 ? { id: d.id, tier: Math.min(tier, d.tiers.length) } : null
}

/** Catalog order, highest first within the profile row; unknown ids dropped. */
export function sortBadges(list: MemberBadge[]): MemberBadge[] {
  const order = new Map(BADGES.map((b, i) => [b.id as string, i]))
  return list.filter((b) => order.has(b.badge)).sort((a, b) => order.get(a.badge)! - order.get(b.badge)!)
}
