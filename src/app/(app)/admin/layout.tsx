import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubNavLayout } from '@/components/shell/sub-nav-layout'

export const metadata = { title: '관리 · AI쓰발' }

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/login')
  if (state.type === 'waitlist') redirect('/waitlist')
  if (!state.member.is_admin) redirect('/feed')
  return (
    <SubNavLayout area="admin">
      {children}
    </SubNavLayout>
  )
}
