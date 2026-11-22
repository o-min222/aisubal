import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
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
    <>
        <AdminClient member={state.member} />
      </>
  )
}
