import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { AccountSettings } from './account-settings'
import { msg } from '@/i18n/translate'

export default async function AccountSettingsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const m = state.member
  return (
    <>
      <SubPageHeader title={msg('계정')} description={msg('로그인 · 멤버십 · 언어')} />
      <AccountSettings email={m.email} joinedAt={m.signup_completed_at} isAdmin={Boolean(m.is_admin)} />
    </>
  )
}
