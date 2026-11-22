import type { Relation } from '@/lib/social-rules'
import { relationBadge } from '@/lib/social-rules'
import { T } from '@/i18n/t'

const TONE: Record<string, { bg: string; fg: string }> = {
  friend: { bg: 'var(--c-e8f5ee)', fg: 'var(--c-1f7a4d)' },
  mutual: { bg: 'var(--c-eef1fb)', fg: 'var(--c-3446a8)' },
  following: { bg: 'var(--n-f2f2f2)', fg: 'var(--n-555)' },
  follower: { bg: 'var(--c-fff4e5)', fg: 'var(--c-9a5b00)' },
}

/** One relation badge: 친구 > 맞팔 > 팔로잉 > 나를 팔로우. */
export function RelationBadge({ relation, label }: { relation?: Relation; label?: string | null }) {
  const b = relation ? relationBadge(relation) : label ? { label, tone: label === '친구' ? 'friend' : label === '맞팔' ? 'mutual' : label === '팔로잉' ? 'following' : 'follower' } : null
  if (!b) return null
  const t = TONE[b.tone]
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 text-[11px] font-medium leading-[18px] whitespace-nowrap"
      style={{ background: t.bg, color: t.fg }}
    >
      <T>{b.label}</T>
    </span>
  )
}
