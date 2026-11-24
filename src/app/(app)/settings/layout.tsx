import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubNavLayout } from '@/components/shell/sub-nav-layout'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('설정 · AI쓰발') }
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  return (
    <SubNavLayout area="settings">
      {children}
    </SubNavLayout>
  )
}
