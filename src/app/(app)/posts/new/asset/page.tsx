import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { NewPostClient } from './new-post-client'

export default async function NewPostPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const unlock = await getNicknameUnlockState()

  return (
    <>
        <NewPostClient
          member={state.member}
          nicknameUnlocked={unlock.unlocked}
          activeMemberCount={unlock.activeCount}
          unlockThreshold={unlock.threshold}
        />
      </>
  )
}
