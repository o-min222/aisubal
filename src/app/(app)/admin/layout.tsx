import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubNavLayout } from '@/components/shell/sub-nav-layout'
import { getT } from '@/i18n/server'
import { I18nArea } from '@/i18n/area'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · AI쓰발') }
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const state = await getUserState()
  if (state.type === 'unauthenticated') redirect('/')
  if (state.type === 'waitlist') redirect('/waitlist')
  if (!state.member.is_admin) redirect('/feed')
  return (
    <I18nArea area="admin">
      <SubNavLayout area="admin">
        {children}
      </SubNavLayout>
    </I18nArea>
  )
}
