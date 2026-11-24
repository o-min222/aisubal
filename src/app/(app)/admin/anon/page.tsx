import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { AnonModeration } from './anon-moderation'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('익명 관리 · AI쓰발') }
}

export default async function AdminAnonPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  if (!state.member.is_admin) redirect('/anon')
  return <AnonModeration />
}
