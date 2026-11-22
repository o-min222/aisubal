import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { InvitesClient } from './invites-client'

export default async function InvitesPage() {
  const state = await getUserState()
  
  if (state.type === 'unauthenticated') {
    redirect('/login')
  }
  
  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }

  return (
    <>
        <InvitesClient member={state.member} />
      </>
  )
}
