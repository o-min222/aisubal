/** Client-safe unlock helpers (no server imports) */
import { DEV_NICKNAME_UNLOCK_THRESHOLD, DEFAULT_NICKNAME_UNLOCK_THRESHOLD, isNicknameUnlocked } from '@/lib/profile'

export function getNicknameUnlockState(activeCount: number, threshold?: number) {
  const t =
    threshold ??
    (process.env.NEXT_PUBLIC_DEV_BYPASS_AUTH === 'true' || process.env.DEV_BYPASS_AUTH === 'true'
      ? DEV_NICKNAME_UNLOCK_THRESHOLD
      : DEFAULT_NICKNAME_UNLOCK_THRESHOLD)
  return {
    unlocked: isNicknameUnlocked(activeCount, t),
    threshold: t,
    activeCount,
  }
}
