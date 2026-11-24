import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { listMyInviteCodes } from '@/lib/data/invites'
import { getSiteSettings } from '@/lib/data/members'
import { InvitesClient } from './invites-client'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('초대하기 · AI쓰발') }
}

export default async function InvitesPage() {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  const member = state.member
  const data = await listMyInviteCodes(member.id, Boolean(member.signup_completed_at)).catch(() => null)
  return <InvitesClient inviterId={member.id} inviterName={member.display_name} inviterAvatarUrl={member.avatar_url} codes={data?.codes ?? []} codesActive={data?.codesActive ?? Boolean(member.signup_completed_at)} loadFailed={!data} allowance={data?.allowance ?? (await getSiteSettings()).invites_per_member} progress={data?.progress ?? { batch: 1, joined: 0, size: 0, completed: 0 }} />
}
