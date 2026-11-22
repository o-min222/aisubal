import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { AnonModeration } from './anon-moderation'

export const metadata = { title: '익명 관리 · AI쓰발' }

export default async function AdminAnonPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  if (!state.member.is_admin) redirect('/anon')
  return <AnonModeration />
}
