import { cache } from 'react'
import { getUserState } from '@/lib/auth'

/** The viewer's own 부캐 id (nickname_profiles.id) — per request; null when they have none. */
export const myNicknameId = cache(async (): Promise<string | null> => {
  const s = await getUserState().catch(() => null)
  return s?.type === 'member' ? (s.member.nickname_id ?? null) : null
})
