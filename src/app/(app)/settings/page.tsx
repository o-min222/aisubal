import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { SettingsClient } from './settings-client'

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>
}) {
  const state = await getUserState()

  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const unlock = await getNicknameUnlockState()
  const sp = await searchParams
  // ?preview=locked — force locked nickname UI for review screenshots
  const forceLocked = sp.preview === 'locked'

  return (
    <>
        <SettingsClient
          member={state.member}
          nicknameUnlocked={forceLocked ? false : unlock.unlocked}
          activeMemberCount={forceLocked ? 1 : unlock.activeCount}
          unlockThreshold={unlock.threshold}
        />
      </>
  )
}
