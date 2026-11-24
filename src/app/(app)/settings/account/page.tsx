import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { AppSetupReminder } from '@/components/app-setup/app-setup-reminder'
import { AccountSettings } from './account-settings'
import { PeekPrivacy } from './peek-privacy'
import { getPeekPref } from '@/lib/data/landing-peek'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('계정 · AI쓰발') }
}

export default async function AccountSettingsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const m = state.member
  const peek = await getPeekPref().catch(() => true)
  return (
    <>
      <SubPageHeader title={msg('계정')} description={msg('로그인 · 멤버십 · 언어 · 화면 모드')} />
      <AppSetupReminder />
      <AccountSettings email={m.email} joinedAt={m.signup_completed_at} isAdmin={Boolean(m.is_admin)} privacy={<PeekPrivacy initial={peek} />} />
    </>
  )
}
