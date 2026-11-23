import { redirect } from 'next/navigation'
import { getUserState } from '@/lib/auth'
import { adminGetSettings } from '@/lib/data/admin'
import { SubPageHeader } from '@/components/shell/sub-nav-layout'
import { SiteSettingsForm } from './site-settings-form'
import { MissionPrompts } from './mission-prompts'
import { adminListPrompts } from '@/lib/data/onboarding'
import { msg } from '@/i18n/translate'
import { getT } from '@/i18n/server'

export async function generateMetadata() {
  const t = await getT()
  return { title: t('관리 · 사이트 · AI쓰발') }
}

export default async function AdminSitePage() {
  const state = await getUserState()
  if (state.type !== 'member' || !state.member.is_admin) redirect('/feed')
  const [settings, prompts] = await Promise.all([adminGetSettings(), adminListPrompts().catch(() => [])])
  return (
    <>
      <SubPageHeader title={msg('사이트 설정')} description={msg('초대·별명 언락 같은 커뮤니티 규칙. 익명 게시판 한도는 ‘익명 관리’에서 바꿔요.')} />
      <div className="space-y-3">
        <SiteSettingsForm initial={settings} />
        <MissionPrompts initial={prompts} />
      </div>
    </>
  )
}
