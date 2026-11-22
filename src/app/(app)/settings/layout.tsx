import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubNavLayout } from '@/components/shell/sub-nav-layout'

export const metadata = { title: '설정 · AI쓰발' }

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  return (
    <SubNavLayout area="settings">
      {children}
    </SubNavLayout>
  )
}
