'use client'

import { useState } from 'react'
import { nameChip, type FriendState } from '@/lib/social-rules'
import { FollowButton } from '@/components/social/follow-button'
import { RelationBadge } from '@/components/social/relation-badge'

/**
 * A82 / A126: the one slot after a person's name (post cards, comments, profile peek). 친구 when we
 * are friends (replaces 맞팔 / 팔로잉); otherwise 맞팔 / 팔로잉 when I follow; not following → nothing,
 * or the "+ 팔로우" chip when `cta` (it turns into the relationship chip once tapped). Unfollow lives
 * on the profile page.
 */
export function NameChip({
  memberId,
  following,
  followsMe,
  friend,
  badge,
  cta = false,
}: {
  memberId: string
  following: boolean
  followsMe?: boolean
  friend?: FriendState
  badge?: string | null
  cta?: boolean
}) {
  const [on, setOn] = useState(following)
  const label = nameChip({ iFollow: on, followsMe, friend: friend ?? (badge === '친구' ? 'friends' : undefined) })
  if (label) return <RelationBadge label={label} />
  if (!cta) return null
  return <FollowButton memberId={memberId} initialFollowing={false} variant="chip" refresh={false} onChange={setOn} />
}
