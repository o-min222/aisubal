import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { NewMeetupClient } from './new-meetup-client'

export default async function NewMeetupPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const unlock = await getNicknameUnlockState()

  return (
    <>
        <NewMeetupClient
          member={state.member}
          nicknameUnlocked={unlock.unlocked}
        />
      </>
  )
}