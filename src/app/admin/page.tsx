import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { Header } from '@/components/header'
import { AdminClient } from './admin-client'

export default async function AdminPage() {
  const state = await getUserState()
  
  if (state.type === 'unauthenticated') {
    redirect('/login')
  }
  
  if (state.type === 'waitlist') {
    redirect('/waitlist')
  }
  
  // Only admins can access this page
  if (!state.member.is_admin) {
    redirect('/feed')
  }

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <Header member={state.member} />
      <main className="container-main page-main">
        <AdminClient member={state.member} />
      </main>
    </div>
  )
}
