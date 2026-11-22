import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { AccountSettings } from './account-settings'

export default async function AccountSettingsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const m = state.member
  return (
    <>
      <SubPageHeader title="계정" description="로그인과 멤버십 정보" />
      <AccountSettings email={m.email} joinedAt={m.signup_completed_at} isAdmin={Boolean(m.is_admin)} />
    </>
  )
}
