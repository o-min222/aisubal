import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { NewToolboxClient } from './new-toolbox-client'

export default async function NewToolboxPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')

  return (
    <>
        <NewToolboxClient />
      </>
  )
}
