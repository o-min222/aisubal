import { redirect } from 'next/navigation'
import { getUserState, getNicknameUnlockState } from '@/lib/auth'
import { Header } from '@/components/header'
import { NewMeetupClient } from './new-meetup-client'

export default async function NewMeetupPage() {
  const state = await getUserState()

  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  const unlock = await getNicknameUnlockState()

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <NewMeetupClient
          member={state.member}
          nicknameUnlocked={unlock.unlocked}
        />
      </main>
    </div>
  )
}