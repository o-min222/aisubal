import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { AppSetupReminder } from '@/components/app-setup/app-setup-reminder'
import { AccountSettings } from './account-settings'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'
import { isMock } from '@/lib/data/client'
import { createClient } from '@/lib/supabase/server'
import type { LoginIdentity } from '@/lib/login-identities'

/** The account's sign-in identities (A22). Mock: the dev account's one Google identity. */
async function loginIdentities(accountEmail: string): Promise<LoginIdentity[]> {
  if (isMock()) return [{ id: 'mock-primary', provider: 'google', email: accountEmail, createdAt: null }]
  const supabase = await createClient()
  const { data } = await supabase.auth.getUserIdentities()
  return (data?.identities ?? []).map((i) => ({
    id: i.identity_id,
    provider: i.provider,
    email: typeof i.identity_data?.email === 'string' ? i.identity_data.email : null,
    createdAt: i.created_at ?? null,
  }))
}

export async function generateMetadata() {
  const t = await getT()
  return { title: t('계정 · AI쓰발') }
}

export default async function AccountSettingsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/login')
  const m = state.member
  const identities = await loginIdentities(m.email)
  return (
    <>
      <SubPageHeader title={msg('계정')} description={msg('로그인 · 멤버십 · 언어 · 화면 모드')} />
      <AppSetupReminder />
      <AccountSettings email={m.email} identities={identities} mock={isMock()} joinedAt={m.signup_completed_at} isAdmin={Boolean(m.is_admin)} />
    </>
  )
}
