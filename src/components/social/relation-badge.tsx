import type { Relation } from '@/lib/social-rules'
import { relationBadge } from '@/lib/social-rules'

const TONE: Record<string, { bg: string; fg: string }> = {
  friend: { bg: '#e8f5ee', fg: '#1f7a4d' },
  mutual: { bg: '#eef1fb', fg: '#3446a8' },
  following: { bg: '#f2f2f2', fg: '#555' },
  follower: { bg: '#fff4e5', fg: '#9a5b00' },
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
      {b.label}
    </span>
  )
}
