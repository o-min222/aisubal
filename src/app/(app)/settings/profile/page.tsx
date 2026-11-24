import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { ProfileCardEditor } from '@/components/profile/profile-card-editor'
import { loadProfileEditor } from '@/lib/data/profile-editor'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('프로필 편집 · AI쓰발') }
}

export default async function ProfileSettingsPage() {
  const state = await getUserState()
  if (state.type !== 'member') redirect('/')
  const props = await loadProfileEditor(state.member)
  return (
    <>
      <SubPageHeader title={msg('프로필 편집')} description={msg('다른 사람에게 보이는 카드 그대로예요. 누르면 바로 고치고, 자동으로 저장돼요.')} />
      <ProfileCardEditor {...props} />
    </>
  )
}
