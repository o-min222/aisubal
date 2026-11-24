'use client'

import { useState } from 'react'
import { nameChip } from '@/lib/social-rules'
import { FollowButton } from '@/components/social/follow-button'
import { RelationBadge } from '@/components/social/relation-badge'

/**
 * A82: the one slot after a person's name (post cards, comments, profile peek). Following → the
 * 맞팔 / 팔로잉 chip; not following → nothing, or the "+ 팔로우" chip when `cta` (it turns into the
 * relationship chip once tapped). Unfollow lives on the profile page.
 */
export function NameChip({ memberId, following, followsMe, cta = false }: { memberId: string; following: boolean; followsMe?: boolean; cta?: boolean }) {
  const [on, setOn] = useState(following)
  const label = nameChip({ iFollow: on, followsMe })
  if (label) return <RelationBadge label={label} />
  if (!cta) return null
  return <FollowButton memberId={memberId} initialFollowing={false} variant="chip" refresh={false} onChange={setOn} />
}
