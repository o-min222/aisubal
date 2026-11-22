import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
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
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <InvitesClient member={state.member} />
      </main>
    </div>
  )
}
