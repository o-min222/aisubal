import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { listMyInviteCodes } from '@/lib/data/invites'
import { InvitesClient } from './invites-client'

export const metadata = { title: '초대하기 · AI쓰발' }

export default async function InvitesPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  const member = state.member
  const data = await listMyInviteCodes(member.id, Boolean(member.signup_completed_at)).catch(() => null)
  return <InvitesClient inviterName={member.display_name} codes={data?.codes ?? []} codesActive={data?.codesActive ?? Boolean(member.signup_completed_at)} loadFailed={!data} />
}
